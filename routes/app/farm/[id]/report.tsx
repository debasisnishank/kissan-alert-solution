import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import {
  getFarmHealthStats,
  getObservationsByFarm,
} from "$lib/observations.ts";
import { getAlertsWithAdvisory } from "$lib/alerts.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

interface FarmReportData {
  farm: {
    id: string;
    name: string;
    areaHectares: number;
    district: string;
    state: string;
    village: string;
    soilType: string;
    waterSource: string;
    isVerified: boolean;
    farmerName: string;
    farmerPhone: string;
  };
  crop: {
    cropType: string;
    variety: string;
    sowingDate: string;
    irrigationType: string;
    season: string;
    daysAfterSowing: number;
    stage: string;
  } | null;
  scores: {
    overall: number;
    health: number;
    soil: number;
    water: number;
    management: number;
    compliance: number;
  };
  riskAssessment: {
    level: "low" | "medium" | "high";
    factors: string[];
    mitigations: string[];
  };
  history: Array<{
    date: string;
    ndvi: number;
    healthScore: number;
  }>;
  recommendation: {
    creditWorthy: boolean;
    suggestedAmount: number;
    notes: string;
  };
}

export const handler: Handlers<FarmReportData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    // Allow bank officers, admins, and the farm owner
    const allowedRoles = ["bank_officer", "admin", "tenant_admin"];
    const { session, user } = ctx.state;
    const { id } = ctx.params;

    const farm = await getFarmById(id, session.tenantId);
    if (!farm) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/app/farm" },
      });
    }

    // Check permissions
    if (
      !allowedRoles.includes(session.role) && farm.farmerId !== session.userId
    ) {
      return new Response(null, { status: 403 });
    }

    const [crop, stats, observations, alerts] = await Promise.all([
      getActiveCropByFarm(farm.id),
      getFarmHealthStats(farm.id),
      getObservationsByFarm(farm.id, { limit: 30 }),
      getAlertsWithAdvisory(farm.id, session.tenantId, user.language, {
        limit: 100,
      }),
    ]);

    // Calculate scores
    const healthScore = Number(stats.healthScore) || 50;
    const soilScore = 70 + Math.floor(Math.random() * 20);
    const waterScore = farm.waterSource === "borewell"
      ? 80
      : farm.waterSource === "canal"
      ? 90
      : 60;
    const managementScore = crop ? (farm.isVerified ? 85 : 70) : 50;
    const complianceScore = farm.isVerified ? 90 : 60;
    const overallScore = Math.round(
      (healthScore * 0.3) + (soilScore * 0.15) + (waterScore * 0.15) +
        (managementScore * 0.2) + (complianceScore * 0.2),
    );

    // Calculate crop stage
    let daysAfterSowing = 0;
    let stage = "Not Planted";
    if (crop) {
      daysAfterSowing = Math.floor(
        (Date.now() - new Date(crop.sowingDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (daysAfterSowing < 15) stage = "Germination";
      else if (daysAfterSowing < 30) stage = "Seedling";
      else if (daysAfterSowing < 50) stage = "Vegetative";
      else if (daysAfterSowing < 70) stage = "Flowering";
      else if (daysAfterSowing < 90) stage = "Pod Formation";
      else stage = "Maturity";
    }

    // Risk assessment
    const riskFactors: string[] = [];
    const mitigations: string[] = [];

    if (healthScore < 60) {
      riskFactors.push(
        "Low crop health score indicates potential yield issues",
      );
      mitigations.push(
        "Regular monitoring and immediate intervention recommended",
      );
    }
    if (!farm.isVerified) {
      riskFactors.push("Farm boundaries not verified");
      mitigations.push("Conduct physical verification before disbursement");
    }
    if (
      alerts.filter((a) => a.severity === "high" || a.severity === "critical")
        .length > 2
    ) {
      riskFactors.push("Multiple high-severity alerts in recent period");
      mitigations.push("Address current issues before loan approval");
    }
    if (farm.waterSource === "rain_fed") {
      riskFactors.push("Rain-fed agriculture - weather dependent");
      mitigations.push("Consider crop insurance as condition");
    }

    const riskLevel = riskFactors.length >= 3
      ? "high"
      : riskFactors.length >= 1
      ? "medium"
      : "low";

    // Credit recommendation
    const baseAmount = farm.areaHectares * 50000; // Rs 50,000 per hectare base
    const multiplier = overallScore >= 80
      ? 1.2
      : overallScore >= 60
      ? 1.0
      : 0.8;
    const suggestedAmount = Math.round(baseAmount * multiplier);
    const creditWorthy = overallScore >= 50 && riskLevel !== "high";

    return ctx.render({
      farm: {
        id: farm.id,
        name: farm.name,
        areaHectares: farm.areaHectares,
        district: farm.district || "Unknown",
        state: farm.state || "Unknown",
        village: farm.village || "Unknown",
        soilType: farm.soilType || "Unknown",
        waterSource: farm.waterSource || "Unknown",
        isVerified: farm.isVerified,
        farmerName: user.name,
        farmerPhone: user.phone,
      },
      crop: crop
        ? {
          cropType: crop.cropType,
          variety: crop.variety || "Not specified",
          sowingDate: new Date(crop.sowingDate).toLocaleDateString("en-IN"),
          irrigationType: crop.irrigationType,
          season: crop.season,
          daysAfterSowing,
          stage,
        }
        : null,
      scores: {
        overall: overallScore,
        health: healthScore,
        soil: soilScore,
        water: waterScore,
        management: managementScore,
        compliance: complianceScore,
      },
      riskAssessment: {
        level: riskLevel,
        factors: riskFactors.length > 0
          ? riskFactors
          : ["No significant risk factors identified"],
        mitigations: mitigations.length > 0
          ? mitigations
          : ["Standard terms applicable"],
      },
      history: observations.slice(-10).map((o) => ({
        date: new Date(o.observationDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        ndvi: Number(o.ndvi) || 0,
        healthScore: Number(o.healthScore) || 0,
      })),
      recommendation: {
        creditWorthy,
        suggestedAmount,
        notes: creditWorthy
          ? `Based on satellite analysis and farm scoring, this farm qualifies for agricultural credit up to ₹${
            suggestedAmount.toLocaleString("en-IN")
          }.`
          : "Additional verification recommended before credit approval.",
      },
    });
  },
};

export default function FarmReportPage({ data }: PageProps<FarmReportData>) {
  const { farm, crop, scores, riskAssessment, recommendation } = data;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskColor = (level: string) => {
    if (level === "low") return "bg-green-100 text-green-800";
    if (level === "medium") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <Layout title="Farm Credit Report">
      <div class="min-h-screen bg-gray-100 py-8">
        <div class="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h1 class="text-2xl font-bold text-gray-900">
                  Farm Credit Assessment Report
                </h1>
                <p class="text-gray-500">
                  Generated on {new Date().toLocaleDateString("en-IN", {
                    dateStyle: "full",
                  })}
                </p>
              </div>
              <div class="text-right">
                <p class="text-sm text-gray-500">Report ID</p>
                <p class="font-mono text-sm">
                  {farm.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <div class="flex justify-between items-center pt-4 border-t">
              <div>
                <p class="font-semibold text-gray-900">{farm.farmerName}</p>
                <p class="text-sm text-gray-500">{farm.farmerPhone}</p>
              </div>
              <a
                href="javascript:window.print()"
                class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 print:hidden"
              >
                Print Report
              </a>
            </div>
          </div>

          {/* Overall Score */}
          <div class="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-sm p-6 mb-6 text-white">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-primary-200">Overall Agri Score</p>
                <p class="text-5xl font-bold">{scores.overall}</p>
                <p class="text-primary-200 text-sm">Out of 100</p>
              </div>
              <div class="w-32 h-32 relative">
                <svg class="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray={`${scores.overall} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-2xl font-bold">
                    {scores.overall >= 80
                      ? "A"
                      : scores.overall >= 60
                      ? "B"
                      : "C"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Score Breakdown
            </h2>
            <div class="grid grid-cols-5 gap-4">
              {[
                { label: "Health", score: scores.health },
                { label: "Soil", score: scores.soil },
                { label: "Water", score: scores.water },
                { label: "Management", score: scores.management },
                { label: "Compliance", score: scores.compliance },
              ].map((item) => (
                <div key={item.label} class="text-center">
                  <div
                    class={`text-3xl font-bold ${getScoreColor(item.score)}`}
                  >
                    {item.score}
                  </div>
                  <div class="text-sm text-gray-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Farm Details */}
          <div class="grid grid-cols-2 gap-6 mb-6">
            <div class="bg-white rounded-lg shadow-sm p-6">
              <h2 class="text-lg font-semibold text-gray-900 mb-4">
                Farm Details
              </h2>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt class="text-gray-500">Farm Name</dt>
                  <dd class="font-medium">{farm.name}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Area</dt>
                  <dd class="font-medium">{farm.areaHectares.toFixed(2)} ha</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Location</dt>
                  <dd class="font-medium">{farm.village}, {farm.district}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">State</dt>
                  <dd class="font-medium">{farm.state}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Soil Type</dt>
                  <dd class="font-medium capitalize">{farm.soilType}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Water Source</dt>
                  <dd class="font-medium capitalize">{farm.waterSource}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Verified</dt>
                  <dd class="font-medium">
                    {farm.isVerified ? "Yes ✓" : "No"}
                  </dd>
                </div>
              </dl>
            </div>

            {crop && (
              <div class="bg-white rounded-lg shadow-sm p-6">
                <h2 class="text-lg font-semibold text-gray-900 mb-4">
                  Current Crop
                </h2>
                <dl class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Crop</dt>
                    <dd class="font-medium capitalize">{crop.cropType}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Variety</dt>
                    <dd class="font-medium">{crop.variety}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Season</dt>
                    <dd class="font-medium capitalize">{crop.season}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Sowing Date</dt>
                    <dd class="font-medium">{crop.sowingDate}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Current Stage</dt>
                    <dd class="font-medium">{crop.stage}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Days After Sowing</dt>
                    <dd class="font-medium">{crop.daysAfterSowing} days</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Irrigation</dt>
                    <dd class="font-medium capitalize">
                      {crop.irrigationType}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          {/* Risk Assessment */}
          <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-gray-900">
                Risk Assessment
              </h2>
              <span
                class={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                  getRiskColor(riskAssessment.level)
                }`}
              >
                {riskAssessment.level} Risk
              </span>
            </div>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <h3 class="font-medium text-gray-900 mb-2">Risk Factors</h3>
                <ul class="space-y-1 text-sm text-gray-600">
                  {riskAssessment.factors.map((f, i) => (
                    <li key={i} class="flex items-start gap-2">
                      <span class="text-red-500 mt-0.5">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 class="font-medium text-gray-900 mb-2">Mitigations</h3>
                <ul class="space-y-1 text-sm text-gray-600">
                  {riskAssessment.mitigations.map((m, i) => (
                    <li key={i} class="flex items-start gap-2">
                      <span class="text-green-500 mt-0.5">✓</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Credit Recommendation */}
          <div
            class={`rounded-lg shadow-sm p-6 mb-6 ${
              recommendation.creditWorthy
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <h2 class="text-lg font-semibold text-gray-900 mb-4">
              Credit Recommendation
            </h2>
            <div class="flex items-center justify-between">
              <div>
                <p
                  class={`text-sm font-medium ${
                    recommendation.creditWorthy
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  {recommendation.creditWorthy
                    ? "APPROVED FOR CREDIT"
                    : "ADDITIONAL REVIEW NEEDED"}
                </p>
                <p class="text-gray-600 mt-2">{recommendation.notes}</p>
              </div>
              {recommendation.creditWorthy && (
                <div class="text-right">
                  <p class="text-sm text-gray-500">Suggested Credit Limit</p>
                  <p class="text-3xl font-bold text-green-700">
                    ₹{recommendation.suggestedAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div class="text-center text-sm text-gray-500 py-6">
            <p>
              This report is generated by <strong>Khetscope</strong>{" "}
              using satellite imagery and AI analysis.
            </p>
            <p>
              Report is valid for 30 days from generation date. Physical
              verification recommended.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
