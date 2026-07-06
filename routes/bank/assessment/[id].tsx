import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import {
  getBankCustomerById,
  getLoanById,
  updateLoanApplication,
} from "$lib/bank.ts";
import { getActiveCropByFarm, getFarmById } from "$lib/farm.ts";
import { getFarmHealthStats } from "$lib/observations.ts";
import { getSoilScore } from "$lib/soil.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface AssessmentDetailData {
  loan: {
    id: string;
    applicationNumber: string | null;
    loanType: string;
    loanPurpose: string | null;
    requestedAmount: number;
    approvedAmount: number | null;
    interestRate: number | null;
    tenureMonths: number | null;
    status: string;
    agriScore: number | null;
    agriScoreBreakdown: Record<string, number> | null;
    riskCategory: string | null;
    assessmentNotes: string | null;
    createdAt: Date;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
    kycStatus: string;
    creditScore: number | null;
  };
  farm?: {
    id: string;
    name: string;
    areaHectares: number;
    district: string | null;
    soilType: string | null;
    waterSource: string | null;
    healthScore: number;
    crop: string | null;
    lat: number;
    lon: number;
  };
  calculatedScore?: {
    overall: number;
    health: number;
    soil: number;
    water: number;
    management: number;
    creditScore: number;
    riskCategory: string;
  };
  success?: string;
  error?: string;
}

export const handler: Handlers<AssessmentDetailData, AuthState> = {
  async GET(req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const allowedRoles = ["bank_officer", "admin", "tenant_admin"];
    if (!allowedRoles.includes(ctx.state.session.role)) {
      return new Response(null, { status: 302, headers: { Location: "/app" } });
    }

    const tenantId = ctx.state.session.tenantId;
    const loanId = ctx.params.id;

    const url = new URL(req.url);
    const success = url.searchParams.get("success") || undefined;

    const loan = await getLoanById(loanId, tenantId);
    if (!loan) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/assessments" },
      });
    }

    const customer = await getBankCustomerById(loan.customerId, tenantId);
    if (!customer) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/assessments" },
      });
    }

    let farm: AssessmentDetailData["farm"] | undefined;
    let calculatedScore: AssessmentDetailData["calculatedScore"] | undefined;

    if (loan.farmId) {
      const farmData = await getFarmById(loan.farmId, tenantId);
      if (farmData) {
        const stats = await getFarmHealthStats(loan.farmId);
        const crop = await getActiveCropByFarm(loan.farmId);
        const lat = 20.5; // Default - would extract from farm polygon
        const lon = 78.5;

        farm = {
          id: farmData.id,
          name: farmData.name,
          areaHectares: farmData.areaHectares,
          district: farmData.district,
          soilType: farmData.soilType,
          waterSource: farmData.waterSource,
          healthScore: stats?.healthScore ? Number(stats.healthScore) : 60,
          crop: crop?.cropType || null,
          lat,
          lon,
        };

        // Calculate Agri Score
        const healthScore = farm.healthScore;
        const soilScore = getSoilScore({
          farmId: farmData.id,
          soilType: farmData.soilType || undefined,
          waterSource: farmData.waterSource || undefined,
        });
        const waterScore = farmData.waterSource === "canal"
          ? 90
          : farmData.waterSource === "drip"
          ? 95
          : farmData.waterSource === "borewell"
          ? 80
          : 60;
        const managementScore = crop ? (farmData.isVerified ? 85 : 70) : 50;
        const creditScoreValue = customer.creditScore
          ? Math.round((customer.creditScore - 300) / 6)
          : 60;

        const overall = Math.round(
          healthScore * 0.3 +
            soilScore * 0.15 +
            waterScore * 0.15 +
            managementScore * 0.15 +
            creditScoreValue * 0.25,
        );

        const riskCategory = overall >= 70
          ? "low"
          : overall >= 50
          ? "medium"
          : "high";

        calculatedScore = {
          overall,
          health: healthScore,
          soil: soilScore,
          water: waterScore,
          management: managementScore,
          creditScore: creditScoreValue,
          riskCategory,
        };
      }
    }

    return ctx.render({
      loan: {
        id: loan.id,
        applicationNumber: loan.applicationNumber,
        loanType: loan.loanType,
        loanPurpose: loan.loanPurpose,
        requestedAmount: loan.requestedAmount,
        approvedAmount: loan.approvedAmount,
        interestRate: loan.interestRate,
        tenureMonths: loan.tenureMonths,
        status: loan.status,
        agriScore: loan.agriScore,
        agriScoreBreakdown: loan.agriScoreBreakdown,
        riskCategory: loan.riskCategory,
        assessmentNotes: loan.assessmentNotes,
        createdAt: loan.createdAt,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        kycStatus: customer.kycStatus,
        creditScore: customer.creditScore,
      },
      farm,
      calculatedScore,
      success,
    });
  },

  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const tenantId = ctx.state.session.tenantId;
    const userId = ctx.state.session.userId;
    const loanId = ctx.params.id;
    const formData = await req.formData();
    const action = formData.get("action") as string;

    if (action === "assess") {
      const agriScore = parseInt(formData.get("agriScore") as string, 10);
      const healthScore = parseInt(formData.get("healthScore") as string, 10);
      const soilScore = parseInt(formData.get("soilScore") as string, 10);
      const waterScore = parseInt(formData.get("waterScore") as string, 10);
      const managementScore = parseInt(
        formData.get("managementScore") as string,
        10,
      );
      const creditScoreValue = parseInt(
        formData.get("creditScoreValue") as string,
        10,
      );
      const riskCategory = formData.get("riskCategory") as string;
      const assessmentNotes = formData.get("assessmentNotes") as string;

      await updateLoanApplication(loanId, tenantId, {
        status: "under_review",
        agriScore,
        agriScoreBreakdown: {
          health: healthScore,
          soil: soilScore,
          water: waterScore,
          management: managementScore,
          credit: creditScoreValue,
        },
        riskCategory,
        assessmentNotes,
        assessedBy: userId,
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/assessment/${loanId}?success=Assessment completed`,
        },
      });
    }

    if (action === "approve") {
      const approvedAmount = parseFloat(
        formData.get("approvedAmount") as string,
      );
      const interestRate = parseFloat(formData.get("interestRate") as string);

      await updateLoanApplication(loanId, tenantId, {
        status: "approved",
        approvedAmount,
        interestRate,
        approvedBy: userId,
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/assessment/${loanId}?success=Loan approved`,
        },
      });
    }

    if (action === "reject") {
      const assessmentNotes = formData.get("rejectionReason") as string;

      await updateLoanApplication(loanId, tenantId, {
        status: "rejected",
        assessmentNotes,
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/assessment/${loanId}?success=Loan rejected`,
        },
      });
    }

    if (action === "disburse") {
      await updateLoanApplication(loanId, tenantId, {
        status: "disbursed",
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `/bank/assessment/${loanId}?success=Loan disbursed`,
        },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `/bank/assessment/${loanId}` },
    });
  },
};

export default function AssessmentDetailPage(
  { data }: PageProps<AssessmentDetailData>,
) {
  const { loan, customer, farm, calculatedScore, success } = data;

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-yellow-100 text-yellow-700",
    under_review: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    disbursed: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-700",
  };

  const loanTypeLabels: Record<string, string> = {
    crop_loan: "Crop Loan (KCC)",
    term_loan: "Agriculture Term Loan",
    equipment_loan: "Equipment/Machinery Loan",
    dairy_loan: "Dairy/Animal Husbandry",
    irrigation_loan: "Irrigation/Borewell Loan",
    storage_loan: "Warehouse/Storage Loan",
    land_development: "Land Development Loan",
  };

  return (
    <Layout
      title={`Assessment ${
        loan.applicationNumber || loan.id.slice(0, 8)
      } - Bank Portal`}
    >
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-5xl mx-auto px-6 py-4">
            <a
              href="/bank/assessments"
              class="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Back to Assessments
            </a>
          </div>
        </header>

        <main class="max-w-5xl mx-auto px-6 py-6">
          {success && (
            <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {success}
            </div>
          )}

          {/* Header */}
          <div class="bg-white rounded-xl border p-6 mb-6">
            <div class="flex items-start justify-between mb-4">
              <div>
                <div class="flex items-center gap-3 mb-2">
                  <h1 class="text-2xl font-bold text-gray-900">
                    {loan.applicationNumber ||
                      `Application ${loan.id.slice(0, 8)}`}
                  </h1>
                  <span
                    class={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                      statusColors[loan.status]
                    }`}
                  >
                    {loan.status.replace("_", " ")}
                  </span>
                </div>
                <p class="text-gray-600">
                  {loanTypeLabels[loan.loanType] || loan.loanType}
                </p>
                <p class="text-sm text-gray-500">
                  Created:{" "}
                  {new Date(loan.createdAt).toLocaleDateString("en-IN", {
                    dateStyle: "long",
                  })}
                </p>
              </div>
              <div class="text-right">
                <p class="text-3xl font-bold text-gray-900">
                  ₹{(loan.requestedAmount / 100000).toFixed(2)}L
                </p>
                <p class="text-sm text-gray-500">Requested Amount</p>
                {loan.approvedAmount && (
                  <p class="text-lg font-bold text-green-600 mt-2">
                    ₹{(loan.approvedAmount / 100000).toFixed(2)}L Approved
                  </p>
                )}
              </div>
            </div>

            {/* Customer Info */}
            <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div class="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                <span class="text-xl font-bold text-indigo-600">
                  {customer.name.charAt(0)}
                </span>
              </div>
              <div class="flex-1">
                <p class="font-medium text-gray-900">{customer.name}</p>
                <p class="text-sm text-gray-600">{customer.phone}</p>
              </div>
              <div class="text-right">
                <span
                  class={`px-2 py-1 rounded text-xs font-medium capitalize ${
                    customer.kycStatus === "verified"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  KYC: {customer.kycStatus}
                </span>
                {customer.creditScore && (
                  <p class="text-sm mt-1">
                    CIBIL:{" "}
                    <span
                      class={customer.creditScore >= 750
                        ? "text-green-600 font-bold"
                        : "text-yellow-600 font-bold"}
                    >
                      {customer.creditScore}
                    </span>
                  </p>
                )}
              </div>
              <a
                href={`/bank/customers/${customer.id}`}
                class="text-indigo-600 text-sm hover:underline"
              >
                View Profile
              </a>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left - Details & Actions */}
            <div class="lg:col-span-2 space-y-6">
              {/* Farm Details */}
              {farm && (
                <div class="bg-white rounded-xl border p-6">
                  <h2 class="font-semibold text-gray-900 mb-4">
                    Farm Assessment
                  </h2>
                  <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p class="text-sm text-gray-500">Farm Name</p>
                      <p class="font-medium">{farm.name}</p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">Area</p>
                      <p class="font-medium">
                        {farm.areaHectares.toFixed(2)} ha
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">District</p>
                      <p class="font-medium">{farm.district || "N/A"}</p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">Soil Type</p>
                      <p class="font-medium capitalize">
                        {farm.soilType?.replace("_", " ") || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">Water Source</p>
                      <p class="font-medium capitalize">
                        {farm.waterSource || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">Current Crop</p>
                      <p class="font-medium capitalize">{farm.crop || "N/A"}</p>
                    </div>
                  </div>
                  <a
                    href={`/app/farm/${farm.id}`}
                    class="inline-block mt-4 text-indigo-600 text-sm hover:underline"
                  >
                    View Full Farm Report →
                  </a>
                </div>
              )}

              {/* Assessment Form */}
              {(loan.status === "draft" || loan.status === "submitted") &&
                calculatedScore && (
                <div class="bg-white rounded-xl border p-6">
                  <h2 class="font-semibold text-gray-900 mb-4">
                    Agri Score Assessment
                  </h2>
                  <form method="POST">
                    <input type="hidden" name="action" value="assess" />
                    <input
                      type="hidden"
                      name="agriScore"
                      value={calculatedScore.overall}
                    />
                    <input
                      type="hidden"
                      name="healthScore"
                      value={calculatedScore.health}
                    />
                    <input
                      type="hidden"
                      name="soilScore"
                      value={calculatedScore.soil}
                    />
                    <input
                      type="hidden"
                      name="waterScore"
                      value={calculatedScore.water}
                    />
                    <input
                      type="hidden"
                      name="managementScore"
                      value={calculatedScore.management}
                    />
                    <input
                      type="hidden"
                      name="creditScoreValue"
                      value={calculatedScore.creditScore}
                    />
                    <input
                      type="hidden"
                      name="riskCategory"
                      value={calculatedScore.riskCategory}
                    />

                    {/* Score Breakdown */}
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <ScoreItem
                        label="Crop Health (30%)"
                        value={calculatedScore.health}
                      />
                      <ScoreItem
                        label="Soil Quality (15%)"
                        value={calculatedScore.soil}
                      />
                      <ScoreItem
                        label="Water Access (15%)"
                        value={calculatedScore.water}
                      />
                      <ScoreItem
                        label="Farm Mgmt (15%)"
                        value={calculatedScore.management}
                      />
                      <ScoreItem
                        label="Credit History (25%)"
                        value={calculatedScore.creditScore}
                      />
                      <div class="text-center p-4 bg-indigo-50 rounded-lg">
                        <p
                          class={`text-3xl font-bold ${
                            calculatedScore.overall >= 70
                              ? "text-green-600"
                              : calculatedScore.overall >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {calculatedScore.overall}
                        </p>
                        <p class="text-sm text-gray-600">Overall Score</p>
                        <span
                          class={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            calculatedScore.riskCategory === "low"
                              ? "bg-green-100 text-green-700"
                              : calculatedScore.riskCategory === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {calculatedScore.riskCategory} Risk
                        </span>
                      </div>
                    </div>

                    <div class="mb-4">
                      <label class="block text-sm font-medium text-gray-700 mb-1">
                        Assessment Notes
                      </label>
                      <textarea
                        name="assessmentNotes"
                        rows={3}
                        class="w-full px-4 py-2 border rounded-lg"
                        placeholder="Add your assessment notes..."
                      />
                    </div>

                    <button
                      type="submit"
                      class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                    >
                      Complete Assessment
                    </button>
                  </form>
                </div>
              )}

              {/* Approval Form */}
              {loan.status === "under_review" && (
                <div class="bg-white rounded-xl border p-6">
                  <h2 class="font-semibold text-gray-900 mb-4">
                    Loan Decision
                  </h2>
                  <div class="grid grid-cols-2 gap-4">
                    {/* Approve Form */}
                    <form method="POST" class="p-4 border rounded-lg">
                      <input type="hidden" name="action" value="approve" />
                      <h3 class="font-medium text-green-700 mb-3">
                        Approve Loan
                      </h3>
                      <div class="mb-3">
                        <label class="block text-sm text-gray-600 mb-1">
                          Approved Amount (₹)
                        </label>
                        <input
                          type="number"
                          name="approvedAmount"
                          defaultValue={loan.requestedAmount}
                          required
                          class="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div class="mb-3">
                        <label class="block text-sm text-gray-600 mb-1">
                          Interest Rate (%)
                        </label>
                        <input
                          type="number"
                          name="interestRate"
                          step="0.1"
                          defaultValue={loan.riskCategory === "low"
                            ? "7.0"
                            : loan.riskCategory === "medium"
                            ? "9.0"
                            : "12.0"}
                          required
                          class="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        class="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                      >
                        Approve
                      </button>
                    </form>

                    {/* Reject Form */}
                    <form method="POST" class="p-4 border rounded-lg">
                      <input type="hidden" name="action" value="reject" />
                      <h3 class="font-medium text-red-700 mb-3">Reject Loan</h3>
                      <div class="mb-3">
                        <label class="block text-sm text-gray-600 mb-1">
                          Rejection Reason
                        </label>
                        <textarea
                          name="rejectionReason"
                          rows={4}
                          required
                          class="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="Provide reason for rejection..."
                        />
                      </div>
                      <button
                        type="submit"
                        class="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Disburse Button */}
              {loan.status === "approved" && (
                <div class="bg-white rounded-xl border p-6">
                  <h2 class="font-semibold text-gray-900 mb-4">Disbursement</h2>
                  <p class="text-gray-600 mb-4">
                    Approved amount:{" "}
                    <span class="font-bold text-green-600">
                      ₹{((loan.approvedAmount || 0) / 100000).toFixed(2)}L
                    </span>
                    {" at "}
                    <span class="font-bold">{loan.interestRate}%</span> interest
                  </p>
                  <form method="POST">
                    <input type="hidden" name="action" value="disburse" />
                    <button
                      type="submit"
                      class="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                    >
                      Mark as Disbursed
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Right - Summary */}
            <div class="space-y-6">
              {/* Existing Score */}
              {loan.agriScore && (
                <div class="bg-white rounded-xl border p-6">
                  <h3 class="font-semibold text-gray-900 mb-4">
                    Assessment Result
                  </h3>
                  <div class="text-center mb-4">
                    <p
                      class={`text-4xl font-bold ${
                        loan.agriScore >= 70
                          ? "text-green-600"
                          : loan.agriScore >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {loan.agriScore}
                    </p>
                    <p class="text-sm text-gray-500">Agri Score</p>
                    {loan.riskCategory && (
                      <span
                        class={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium capitalize ${
                          loan.riskCategory === "low"
                            ? "bg-green-100 text-green-700"
                            : loan.riskCategory === "medium"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {loan.riskCategory} Risk
                      </span>
                    )}
                  </div>
                  {loan.agriScoreBreakdown && (
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between">
                        <span class="text-gray-600">Crop Health</span>
                        <span class="font-medium">
                          {loan.agriScoreBreakdown.health}
                        </span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-600">Soil Quality</span>
                        <span class="font-medium">
                          {loan.agriScoreBreakdown.soil}
                        </span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-600">Water Access</span>
                        <span class="font-medium">
                          {loan.agriScoreBreakdown.water}
                        </span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-600">Management</span>
                        <span class="font-medium">
                          {loan.agriScoreBreakdown.management}
                        </span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-gray-600">Credit Score</span>
                        <span class="font-medium">
                          {loan.agriScoreBreakdown.credit}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loan Details */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Loan Details</h3>
                <div class="space-y-3 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600">Type</span>
                    <span class="font-medium">
                      {loanTypeLabels[loan.loanType] || loan.loanType}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600">Tenure</span>
                    <span class="font-medium">
                      {loan.tenureMonths} months
                    </span>
                  </div>
                  {loan.approvedAmount && (
                    <div class="flex justify-between">
                      <span class="text-gray-600">Approved</span>
                      <span class="font-medium text-green-600">
                        ₹{(loan.approvedAmount / 1000).toFixed(0)}K
                      </span>
                    </div>
                  )}
                  {loan.interestRate && (
                    <div class="flex justify-between">
                      <span class="text-gray-600">Interest Rate</span>
                      <span class="font-medium">{loan.interestRate}%</span>
                    </div>
                  )}
                </div>
                {loan.loanPurpose && (
                  <div class="mt-4 pt-4 border-t">
                    <p class="text-xs text-gray-500 mb-1">Purpose</p>
                    <p class="text-sm text-gray-700">{loan.loanPurpose}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {loan.assessmentNotes && (
                <div class="bg-white rounded-xl border p-6">
                  <h3 class="font-semibold text-gray-900 mb-2">
                    Assessment Notes
                  </h3>
                  <p class="text-sm text-gray-600">{loan.assessmentNotes}</p>
                </div>
              )}

              {/* Print/Export */}
              <div class="bg-white rounded-xl border p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Export</h3>
                <div class="space-y-2">
                  {farm && (
                    <a
                      href={`/app/farm/${farm.id}/report`}
                      target="_blank"
                      class="block w-full px-4 py-2 text-center border border-indigo-600 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50"
                    >
                      View Farm Report
                    </a>
                  )}
                  <a
                    href="javascript:window.print()"
                    class="block w-full px-4 py-2 text-center bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                  >
                    Print Assessment
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}

function ScoreItem({ label, value }: { label: string; value: number }) {
  return (
    <div class="text-center p-3 bg-gray-50 rounded-lg">
      <p
        class={`text-xl font-bold ${
          value >= 70
            ? "text-green-600"
            : value >= 50
            ? "text-yellow-600"
            : "text-red-600"
        }`}
      >
        {value}
      </p>
      <p class="text-xs text-gray-500">{label}</p>
    </div>
  );
}
