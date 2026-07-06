/**
 * Farm Event Notification System
 *
 * Automatically sends push notifications to farm owners when farm data updates:
 * - NDVI/satellite observation updates
 * - Weather alerts (heavy rain, drought, frost)
 * - Health score changes (significant drops)
 * - Advisory/alert creation
 * - Crop stage transitions
 * - Soil condition changes
 * - Report/analysis ready
 */

import { query, queryOne } from "$db/client.ts";
import { sendPushNotification } from "$lib/notifications.ts";

interface FarmOwner {
  userId: string;
  farmName: string;
  farmId: string;
  language: string;
}

async function getFarmOwner(farmId: string): Promise<FarmOwner | null> {
  const row = await queryOne<{
    user_id: string;
    farm_name: string;
    farm_id: string;
    language: string;
  }>(
    `SELECT u.id as user_id, f.name as farm_name, f.id as farm_id,
            COALESCE(u.language, 'en') as language
     FROM farms f
     JOIN users u ON f.farmer_id = u.id
     WHERE f.id = $1 AND u.is_active = true`,
    [farmId],
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    farmName: row.farm_name,
    farmId: row.farm_id,
    language: row.language,
  };
}

async function hasPushToken(userId: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM push_tokens WHERE user_id = $1`,
    [userId],
  );
  return (r?.c || 0) > 0;
}

// Debounce: don't send the same event type for the same farm within N hours
async function shouldNotify(
  farmId: string,
  eventType: string,
  dedupeHours = 6,
): Promise<boolean> {
  const recent = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM alerts
     WHERE farm_id = $1 AND type = $2
     AND created_at > NOW() - INTERVAL '${dedupeHours} hours'`,
    [farmId, eventType],
  );
  return (recent?.c || 0) === 0;
}

function silentSend(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  sendPushNotification(userId, title, body, data).catch((err) =>
    console.error(`[FARM-EVENT] Push failed for ${userId}:`, err)
  );
}

// ─── Event: NDVI / Satellite Observation Updated ────────────────────────────

export async function onObservationUpdated(
  farmId: string,
  obs: {
    ndvi?: number;
    healthScore?: number;
    source?: string;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;

  const ndvi = obs.ndvi;
  const health = obs.healthScore;

  // Check previous observation for comparison
  const prev = await queryOne<{ ndvi: number; health_score: number }>(
    `SELECT ndvi, health_score FROM farm_observations
     WHERE farm_id = $1
     ORDER BY observation_date DESC
     OFFSET 1 LIMIT 1`,
    [farmId],
  );

  const prevNdvi = prev?.ndvi ? Number(prev.ndvi) : null;
  const prevHealth = prev?.health_score ? Number(prev.health_score) : null;

  // Significant NDVI drop (>15%)
  if (ndvi && prevNdvi && prevNdvi > 0) {
    const dropPct = ((prevNdvi - ndvi) / prevNdvi) * 100;
    if (dropPct > 15) {
      silentSend(
        owner.userId,
        `${owner.farmName}: Vegetation Drop`,
        `NDVI dropped ${dropPct.toFixed(0)}% (${prevNdvi.toFixed(2)} → ${
          ndvi.toFixed(2)
        }). Check your crop for stress.`,
        {
          screen: "FarmDetail",
          params: JSON.stringify({ farmId }),
          channel: "alerts",
          icon: "ic_crop",
        },
      );
      return;
    }
  }

  // Health score significant change
  if (health && prevHealth) {
    const healthDrop = prevHealth - health;
    if (healthDrop > 15) {
      silentSend(
        owner.userId,
        `${owner.farmName}: Health Score Dropped`,
        `Farm health went from ${prevHealth.toFixed(0)}% to ${
          health.toFixed(0)
        }%. Tap to see details.`,
        {
          screen: "FarmDetail",
          params: JSON.stringify({ farmId }),
          channel: "alerts",
          icon: "ic_alert",
        },
      );
      return;
    }
    if (healthDrop < -10 && health >= 70) {
      silentSend(
        owner.userId,
        `${owner.farmName}: Health Improving`,
        `Good news! Farm health improved to ${health.toFixed(0)}%.`,
        {
          screen: "FarmDetail",
          params: JSON.stringify({ farmId }),
          channel: "default",
        },
      );
      return;
    }
  }

  // First observation ever — notify that satellite data is now available
  if (!prev && ndvi) {
    silentSend(
      owner.userId,
      `${owner.farmName}: First Satellite Report Ready`,
      `Your farm's satellite analysis is now available. NDVI: ${
        ndvi.toFixed(2)
      }, Health: ${(health || 0).toFixed(0)}%.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "default",
      },
    );
  }
}

// ─── Event: Weather Alert for Farm ──────────────────────────────────────────

export async function onWeatherUpdate(
  farmId: string,
  weather: {
    rainfall7d?: number;
    tempMax?: number;
    tempMin?: number;
    description?: string;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;

  const { rainfall7d, tempMax, tempMin } = weather;

  // Heavy rainfall warning
  if (rainfall7d && rainfall7d > 100) {
    if (!(await shouldNotify(farmId, "weather", 12))) return;
    const severity = rainfall7d > 200 ? "Critical" : "Heavy";
    silentSend(
      owner.userId,
      `${severity} Rain Alert: ${owner.farmName}`,
      `${
        rainfall7d.toFixed(0)
      }mm rainfall in 7 days. Ensure drainage and avoid spraying.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "alerts",
        icon: "ic_weather",
        sound: "alert_tone",
      },
    );
  }

  // Extreme heat
  if (tempMax && tempMax > 42) {
    if (!(await shouldNotify(farmId, "weather", 12))) return;
    silentSend(
      owner.userId,
      `Heat Wave Alert: ${owner.farmName}`,
      `Temperature reaching ${
        tempMax.toFixed(0)
      }°C. Irrigate during cooler hours and provide shade for sensitive crops.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "alerts",
        icon: "ic_weather",
      },
    );
  }

  // Frost warning
  if (tempMin !== undefined && tempMin < 4) {
    if (!(await shouldNotify(farmId, "weather", 12))) return;
    silentSend(
      owner.userId,
      `Frost Warning: ${owner.farmName}`,
      `Temperature dropping to ${
        tempMin.toFixed(0)
      }°C. Protect crops from frost damage.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "alerts",
        icon: "ic_weather",
        sound: "alert_tone",
      },
    );
  }
}

// ─── Event: Alert/Advisory Created ──────────────────────────────────────────

export async function onAlertCreated(
  farmId: string,
  alert: {
    type: string;
    severity: string;
    title: string;
    description: string;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;

  const channelMap: Record<string, string> = {
    critical: "alerts",
    high: "alerts",
    medium: "default",
    low: "default",
  };
  const soundMap: Record<string, string> = {
    critical: "alert_tone",
    high: "alert_tone",
    medium: "default",
    low: "default",
  };

  silentSend(
    owner.userId,
    `${owner.farmName}: ${alert.title}`,
    alert.description.slice(0, 200),
    {
      screen: "Alerts",
      channel: channelMap[alert.severity] || "default",
      icon: "ic_alert",
      sound: soundMap[alert.severity] || "default",
    },
  );
}

// ─── Event: Crop Stage Transition ───────────────────────────────────────────

export async function onCropStageChanged(
  farmId: string,
  crop: {
    cropType: string;
    previousStage: string;
    newStage: string;
    daysAfterSowing: number;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;

  const stageAdvice: Record<string, string> = {
    Seedling: "Ensure adequate moisture and watch for early pests.",
    Vegetative: "Apply nitrogen fertilizer if needed. Monitor growth.",
    Flowering: "Critical stage - maintain irrigation and scout for pests.",
    "Pod Formation": "Ensure potassium supply. Protect from pod borers.",
    Maturity: "Prepare for harvest. Monitor moisture levels.",
  };

  const advice = stageAdvice[crop.newStage] || "Monitor your crop closely.";

  silentSend(
    owner.userId,
    `${owner.farmName}: ${crop.cropType} → ${crop.newStage}`,
    `Day ${crop.daysAfterSowing}: Your ${crop.cropType} entered ${crop.newStage} stage. ${advice}`,
    {
      screen: "FarmDetail",
      params: JSON.stringify({ farmId }),
      channel: "default",
    },
  );
}

// ─── Event: Soil Condition Update ───────────────────────────────────────────

export async function onSoilUpdate(
  farmId: string,
  soil: {
    soilMoisture?: number;
    previousMoisture?: number;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;
  if (!soil.soilMoisture) return;

  // Very dry soil alert
  if (soil.soilMoisture < 20) {
    if (!(await shouldNotify(farmId, "irrigation", 24))) return;
    silentSend(
      owner.userId,
      `${owner.farmName}: Low Soil Moisture`,
      `Soil moisture at ${
        soil.soilMoisture.toFixed(0)
      }% — irrigation recommended.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "alerts",
        icon: "ic_crop",
      },
    );
  }

  // Waterlogged soil
  if (soil.soilMoisture > 90) {
    if (!(await shouldNotify(farmId, "irrigation", 24))) return;
    silentSend(
      owner.userId,
      `${owner.farmName}: Waterlogged Soil`,
      `Soil moisture at ${
        soil.soilMoisture.toFixed(0)
      }% — ensure drainage to prevent root damage.`,
      {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId }),
        channel: "alerts",
        icon: "ic_weather",
      },
    );
  }
}

// ─── Event: Analysis/Report Ready ───────────────────────────────────────────

export async function onReportReady(
  farmId: string,
  report: {
    type: "satellite" | "health" | "crop_scan" | "advisory";
    summary: string;
  },
): Promise<void> {
  const owner = await getFarmOwner(farmId);
  if (!owner || !(await hasPushToken(owner.userId))) return;

  const titleMap = {
    satellite: "Satellite Report Ready",
    health: "Health Analysis Updated",
    crop_scan: "Crop Scan Results Ready",
    advisory: "New Advisory Available",
  };

  silentSend(
    owner.userId,
    `${owner.farmName}: ${titleMap[report.type]}`,
    report.summary.slice(0, 200),
    {
      screen: "FarmDetail",
      params: JSON.stringify({ farmId }),
      channel: "default",
    },
  );
}

// ─── Batch: Notify all farm owners after bulk update ────────────────────────

export async function notifyFarmsAfterBulkUpdate(
  farmIds: string[],
  event: {
    title: string;
    body: string;
    type: string;
  },
): Promise<{ notified: number; skipped: number }> {
  let notified = 0;
  let skipped = 0;

  const owners = await query<{
    user_id: string;
    farm_id: string;
    farm_name: string;
  }>(
    `SELECT DISTINCT ON (u.id) u.id as user_id, f.id as farm_id, f.name as farm_name
     FROM farms f
     JOIN users u ON f.farmer_id = u.id
     JOIN push_tokens pt ON pt.user_id = u.id
     WHERE f.id = ANY($1) AND u.is_active = true`,
    [farmIds],
  );

  for (const o of owners) {
    try {
      await sendPushNotification(o.user_id, event.title, event.body, {
        screen: "FarmDetail",
        params: JSON.stringify({ farmId: o.farm_id }),
        channel: "default",
      });
      notified++;
    } catch {
      skipped++;
    }
  }

  return { notified, skipped };
}
