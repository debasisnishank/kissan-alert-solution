import { createAdvisoryMessage, createAlert } from "$lib/alerts.ts";
import { CROP_PROFILES } from "$lib/crop-scoring.ts";
import { getActiveCropByFarm } from "$lib/farm.ts";
import { getDailyWeather } from "$lib/satellite/weather.ts";
import { getFarmHealthStats, getLatestObservation } from "$lib/observations.ts";
import { onCropStageChanged } from "$lib/farm-events.ts";
import { sarvamAI } from "./sarvam.ts";
// import { SUPPORTED_LANGUAGES } from "$utils/constants.ts";
import type {
  Alert,
  CropDeclaration,
  Farm,
  FarmObservation,
} from "$utils/types.ts";

// Advisory Rule Engine
interface AdvisoryRule {
  id: string;
  name: string;
  type: Alert["type"];
  evaluate: (context: AdvisoryContext) => RuleResult | null;
}

interface AdvisoryContext {
  farm: Farm;
  crop?: CropDeclaration;
  latestObservation?: FarmObservation;
  healthStats: {
    latestNdvi: number | null;
    avgNdvi30d: number | null;
    ndviTrend: "improving" | "stable" | "declining" | null;
    totalRainfall7d: number | null;
    healthScore: number | null;
  };
  daysAfterSowing: number | null;
  stage: string | null;
  /** 7-day weather outlook (Open-Meteo); absent when the fetch fails */
  forecast?: {
    rainfall7dMm: number;
    et0_7dMm: number;
    avgTempMaxC: number;
  };
}

interface RuleResult {
  severity: Alert["severity"];
  title: string;
  description: string;
  confidence: number;
  triggerData: Record<string, unknown>;
}

// Advisory templates for localization
const ADVISORY_TEMPLATES: Record<string, { en: string; hi: string }> = {
  pest_risk_high: {
    en:
      "Based on current crop stage ({stage}) and weather conditions (rainfall: {rainfall}mm), there is high risk of pest infestation. Scout your field immediately.",
    hi:
      "वर्तमान फसल अवस्था ({stage}) और मौसम की स्थिति (वर्षा: {rainfall}mm) के आधार पर, कीट संक्रमण का उच्च जोखिम है। तुरंत अपने खेत का निरीक्षण करें।",
  },
  water_stress: {
    en:
      "Your crop is showing signs of water stress. NDVI has dropped by {drop}% compared to last observation. Consider irrigation if no rain is expected.",
    hi:
      "आपकी फसल में पानी की कमी के लक्षण दिख रहे हैं। पिछले अवलोकन की तुलना में NDVI {drop}% कम हो गया है। यदि बारिश की उम्मीद नहीं है तो सिंचाई पर विचार करें।",
  },
  heavy_rainfall: {
    en:
      "Heavy rainfall ({rainfall}mm) recorded in last 7 days. Ensure proper drainage and watch for waterlogging. Avoid any spray applications for next 48 hours.",
    hi:
      "पिछले 7 दिनों में भारी वर्षा ({rainfall}mm) दर्ज। उचित जल निकासी सुनिश्चित करें और जलभराव पर नजर रखें। अगले 48 घंटों तक कोई स्प्रे न करें।",
  },
  nutrient_deficiency: {
    en:
      "Crop vigor is below expected levels for current stage. Consider foliar application of {nutrient} to improve plant health.",
    hi:
      "फसल की शक्ति वर्तमान अवस्था के अपेक्षित स्तर से कम है। पौधे के स्वास्थ्य में सुधार के लिए {nutrient} का पर्णीय छिड़काव करें।",
  },
  dry_spell: {
    en:
      "Dry spell ahead: only {forecast}mm rain expected over the next 7 days, while your {crop} at {stage} stage needs ~{need}mm ({deficit}mm short). {action}",
    hi:
      "आने वाले 7 दिनों में केवल {forecast}mm वर्षा की संभावना है, जबकि {stage} अवस्था में आपकी {crop} फसल को ~{need}mm पानी चाहिए ({deficit}mm की कमी)। {action}",
  },
  harvest_ready: {
    en:
      "Based on crop maturity indicators and {days} days since sowing, your crop appears ready for harvest. Check actual field conditions before harvesting.",
    hi:
      "{days} दिनों की बुवाई और फसल परिपक्वता संकेतकों के आधार पर, आपकी फसल कटाई के लिए तैयार दिखती है। कटाई से पहले वास्तविक खेत की स्थिति जांचें।",
  },
};

// Stage water-use coefficients (Kc-style, FAO-56 simplified) keyed by the
// stage names estimateCropStage produces
const STAGE_KC: Record<string, number> = {
  germination: 0.45,
  seedling: 0.65,
  vegetative: 1.0,
  flowering: 1.2,
  "pod formation": 1.1,
  fruiting: 1.1,
  maturity: 0.55,
};

/** 7-day crop water need in mm, from the scoring engine's seasonal totals */
function cropWaterNeed7d(cropType: string, stage: string | null): number {
  const profile = CROP_PROFILES.find((c) => c.id === cropType);
  // Unknown crop: ~4.5mm/day baseline for a mid-season field crop
  const dailyBase = profile ? profile.waterNeedMm / profile.durationDays : 4.5;
  const kc = STAGE_KC[(stage || "vegetative").toLowerCase()] ?? 1.0;
  return dailyBase * kc * 7;
}

const IRRIGATED_SOURCES = [
  "canal",
  "borewell",
  "tubewell",
  "well",
  "drip",
  "sprinkler",
  "pond",
  "tank",
];

// Rule definitions
const ADVISORY_RULES: AdvisoryRule[] = [
  {
    id: "dry_spell_forecast",
    name: "Dry Spell Forecast",
    type: "irrigation",
    evaluate: (ctx) => {
      // Needs an active crop and a successful forecast fetch
      if (!ctx.crop || !ctx.forecast) return null;

      const need = cropWaterNeed7d(ctx.crop.cropType, ctx.stage);
      const forecastRain = ctx.forecast.rainfall7dMm;
      const recentRain = ctx.healthStats.totalRainfall7d ?? 0;

      // Recent rain already covered the coming week's need — soil buffer holds
      if (recentRain >= need) return null;

      // Fire when forecast covers less than 60% of the crop's need
      if (forecastRain >= need * 0.6) return null;

      const deficit = need - forecastRain;
      const isIrrigated = IRRIGATED_SOURCES.includes(
        (ctx.farm.waterSource || "").toLowerCase(),
      );

      // Rainfed farms have no fallback — escalate severity
      const coverage = forecastRain / need;
      let severity: Alert["severity"];
      if (isIrrigated) {
        severity = coverage < 0.2 ? "high" : "medium";
      } else {
        severity = coverage < 0.2 ? "critical" : "high";
      }

      const action = isIrrigated
        ? `Schedule irrigation of ~${
          deficit.toFixed(0)
        }mm through your ${ctx.farm.waterSource} in 2-3 splits this week.`
        : `No irrigation source on record — prioritize mulching to retain moisture and irrigate from any available source; avoid top-dressing fertilizer until rain.`;

      const description = ADVISORY_TEMPLATES.dry_spell.en
        .replace("{forecast}", forecastRain.toFixed(0))
        .replace("{crop}", ctx.crop.cropType)
        .replace("{stage}", ctx.stage || "current")
        .replace("{need}", need.toFixed(0))
        .replace("{deficit}", deficit.toFixed(0))
        .replace("{action}", action);

      return {
        severity,
        title: "Dry Spell Alert",
        description,
        confidence: 0.85,
        triggerData: {
          forecastRainfall7dMm: Number(forecastRain.toFixed(1)),
          cropWaterNeed7dMm: Number(need.toFixed(1)),
          deficitMm: Number(deficit.toFixed(1)),
          recentRainfall7dMm: Number(recentRain.toFixed(1)),
          et0_7dMm: Number(ctx.forecast.et0_7dMm.toFixed(1)),
          waterSource: ctx.farm.waterSource || "rainfed/unknown",
          stage: ctx.stage,
        },
      };
    },
  },
  {
    id: "water_stress_detection",
    name: "Water Stress Detection",
    type: "irrigation",
    evaluate: (ctx) => {
      if (!ctx.latestObservation?.ndvi || !ctx.healthStats.avgNdvi30d) {
        return null;
      }

      const ndviDrop = ctx.healthStats.avgNdvi30d - ctx.latestObservation.ndvi;
      const dropPercent = (ndviDrop / ctx.healthStats.avgNdvi30d) * 100;

      if (dropPercent > 15 && ctx.healthStats.ndviTrend === "declining") {
        return {
          severity: dropPercent > 25 ? "high" : "medium",
          title: "Water Stress Detected",
          description: ADVISORY_TEMPLATES.water_stress.en.replace(
            "{drop}",
            dropPercent.toFixed(1),
          ),
          confidence: 0.75,
          triggerData: {
            ndviDrop: dropPercent,
            trend: ctx.healthStats.ndviTrend,
          },
        };
      }
      return null;
    },
  },
  {
    id: "heavy_rainfall_alert",
    name: "Heavy Rainfall Alert",
    type: "weather",
    evaluate: (ctx) => {
      const rainfall = ctx.healthStats.totalRainfall7d;
      if (!rainfall || rainfall < 100) return null;

      const severity: Alert["severity"] = rainfall > 200
        ? "critical"
        : rainfall > 150
        ? "high"
        : "medium";

      return {
        severity,
        title: "Heavy Rainfall Alert",
        description: ADVISORY_TEMPLATES.heavy_rainfall.en.replace(
          "{rainfall}",
          rainfall.toFixed(0),
        ),
        confidence: 0.9,
        triggerData: { rainfall7d: rainfall },
      };
    },
  },
  {
    id: "pest_risk_weather",
    name: "Weather-based Pest Risk",
    type: "pest",
    evaluate: (ctx) => {
      if (!ctx.crop || !ctx.daysAfterSowing) return null;

      const rainfall = ctx.healthStats.totalRainfall7d ?? 0;
      const stage = ctx.stage ?? "unknown";

      // High pest risk conditions: high humidity (proxy: recent rainfall) + vulnerable stage
      const vulnerableStages = ["flowering", "pod_formation", "grain_filling"];
      const isVulnerableStage = vulnerableStages.some((s) =>
        stage.toLowerCase().includes(s)
      );

      if (rainfall > 50 && isVulnerableStage) {
        return {
          severity: "medium",
          title: "Pest Risk - Monitor Closely",
          description: ADVISORY_TEMPLATES.pest_risk_high.en
            .replace("{stage}", stage)
            .replace("{rainfall}", rainfall.toFixed(0)),
          confidence: 0.65,
          triggerData: { stage, rainfall7d: rainfall },
        };
      }
      return null;
    },
  },
  {
    id: "nutrient_deficiency",
    name: "Nutrient Deficiency Detection",
    type: "nutrient",
    evaluate: (ctx) => {
      if (!ctx.healthStats.latestNdvi || !ctx.stage) return null;

      // Expected NDVI by stage (simplified)
      const expectedNdviByStage: Record<string, number> = {
        seedling: 0.25,
        vegetative: 0.5,
        flowering: 0.65,
        pod_formation: 0.6,
        maturity: 0.4,
      };

      const stageKey = Object.keys(expectedNdviByStage).find((s) =>
        ctx.stage?.toLowerCase().includes(s)
      );
      if (!stageKey) return null;

      const expectedNdvi = expectedNdviByStage[stageKey];
      const actualNdvi = ctx.healthStats.latestNdvi;

      if (actualNdvi < expectedNdvi * 0.7) {
        return {
          severity: "low",
          title: "Consider Nutrient Application",
          description: ADVISORY_TEMPLATES.nutrient_deficiency.en.replace(
            "{nutrient}",
            "NPK + Micronutrients",
          ),
          confidence: 0.55,
          triggerData: { expectedNdvi, actualNdvi, stage: ctx.stage },
        };
      }
      return null;
    },
  },
  {
    id: "harvest_readiness",
    name: "Harvest Readiness",
    type: "harvest",
    evaluate: (ctx) => {
      if (!ctx.crop || !ctx.daysAfterSowing) return null;

      // Typical crop durations (simplified)
      const cropDurations: Record<string, number> = {
        rice: 120,
        wheat: 130,
        soybean: 100,
        cotton: 180,
        maize: 95,
        groundnut: 110,
      };

      const expectedDuration = cropDurations[ctx.crop.cropType] ?? 120;
      const maturityThreshold = expectedDuration * 0.9;

      if (
        ctx.daysAfterSowing >= maturityThreshold &&
        ctx.healthStats.ndviTrend === "declining"
      ) {
        return {
          severity: "low",
          title: "Harvest Readiness Check",
          description: ADVISORY_TEMPLATES.harvest_ready.en.replace(
            "{days}",
            ctx.daysAfterSowing.toString(),
          ),
          confidence: 0.6,
          triggerData: {
            daysAfterSowing: ctx.daysAfterSowing,
            expectedDuration,
          },
        };
      }
      return null;
    },
  },
];

// Estimate crop stage based on days after sowing
function estimateCropStage(daysAfterSowing: number, _cropType: string): string {
  // Simplified stage estimation
  if (daysAfterSowing < 15) return "Germination";
  if (daysAfterSowing < 30) return "Seedling";
  if (daysAfterSowing < 50) return "Vegetative";
  if (daysAfterSowing < 70) return "Flowering";
  if (daysAfterSowing < 90) return "Pod Formation";
  return "Maturity";
}

export async function generateAdvisories(
  farm: Farm,
  languages: string[] = ["en", "hi"],
): Promise<Alert[]> {
  // Gather context
  const crop = await getActiveCropByFarm(farm.id);
  const latestObservation = await getLatestObservation(farm.id);
  const healthStats = await getFarmHealthStats(farm.id);

  // 7-day weather outlook for forecast-based rules (dry spell); degrade
  // silently when offline — rules that need it skip themselves
  let forecast: AdvisoryContext["forecast"];
  try {
    const coords = farm.polygon?.coordinates?.[0];
    if (coords && coords.length > 0) {
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const days = await getDailyWeather({
        lat,
        lon,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
          .toISOString().split("T")[0],
      });
      if (days.length > 0) {
        forecast = {
          rainfall7dMm: days.reduce((s, d) => s + (d.precipitation || 0), 0),
          et0_7dMm: days.reduce((s, d) => s + (d.evapotranspiration || 0), 0),
          avgTempMaxC: days.reduce((s, d) => s + d.temperatureMax, 0) /
            days.length,
        };
      }
    }
  } catch {
    // Offline / API failure → forecast stays undefined
  }

  let daysAfterSowing: number | null = null;
  let stage: string | null = null;

  if (crop) {
    const sowingDate = new Date(crop.sowingDate);
    daysAfterSowing = Math.floor(
      (Date.now() - sowingDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const newStage = latestObservation?.stageEstimate ||
      estimateCropStage(daysAfterSowing, crop.cropType);
    const prevStage = latestObservation?.stageEstimate;
    stage = newStage;

    // Detect crop stage transition and notify
    if (prevStage && newStage !== prevStage) {
      onCropStageChanged(farm.id, {
        cropType: crop.cropType,
        previousStage: prevStage,
        newStage,
        daysAfterSowing,
      }).catch(() => {});
    }
  }

  const context: AdvisoryContext = {
    farm,
    crop: crop ?? undefined,
    latestObservation: latestObservation ?? undefined,
    healthStats: {
      latestNdvi: healthStats.latestNdvi,
      avgNdvi30d: healthStats.avgNdvi30d,
      ndviTrend: healthStats.ndviTrend,
      totalRainfall7d: healthStats.totalRainfall7d,
      healthScore: healthStats.healthScore,
    },
    daysAfterSowing,
    stage,
    forecast,
  };

  const generatedAlerts: Alert[] = [];

  // Evaluate all rules
  for (const rule of ADVISORY_RULES) {
    const result = rule.evaluate(context);
    if (result) {
      // Create alert
      const alert = await createAlert({
        tenantId: farm.tenantId,
        farmId: farm.id,
        type: rule.type,
        severity: result.severity,
        title: result.title,
        description: result.description,
        confidence: result.confidence,
        triggerData: result.triggerData,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // Create localized advisory messages
      for (const lang of languages) {
        try {
          const { summary, audioUrl } = await sarvamAI.summarizeAdvisory(
            {
              type: rule.type,
              severity: result.severity,
              title: result.title,
              description: result.description,
            },
            lang,
          );

          await createAdvisoryMessage({
            alertId: alert.id,
            language: lang,
            title: lang === "en"
              ? result.title
              : await sarvamAI.translate(result.title, "en", lang).then((r) =>
                r.translatedText
              ),
            message: summary,
            actions: [
              {
                label: lang === "en" ? "Learn More" : "और जानें",
                type: "link",
                value: `/learn/${rule.type}`,
              },
              {
                label: lang === "en" ? "Dismiss" : "खारिज करें",
                type: "action",
                value: "dismiss",
              },
            ],
            audioUrl,
          });
        } catch (error) {
          console.error(
            `Failed to create advisory message for ${lang}:`,
            error,
          );
        }
      }

      generatedAlerts.push(alert);
    }
  }

  return generatedAlerts;
}

export { ADVISORY_RULES };
export type { AdvisoryContext, AdvisoryRule };
