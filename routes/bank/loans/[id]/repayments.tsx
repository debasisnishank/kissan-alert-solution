import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "$components/Layout.tsx";
import {
  getLoanById,
  getLoanRepaymentSummary,
  listRepaymentsByLoan,
  type LoanRepayment,
} from "$lib/bank.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";
import RepaymentForm from "$islands/RepaymentForm.tsx";

interface RepaymentPageData {
  loan: {
    id: string;
    applicationNumber: string | null;
    customerName: string;
    approvedAmount: number;
    interestRate: number;
    tenureMonths: number;
    status: string;
  };
  repayments: LoanRepayment[];
  summary: {
    totalPaid: number;
    totalPrincipal: number;
    totalInterest: number;
    paymentCount: number;
    lastPaymentDate: Date | null;
  };
}

export const handler: Handlers<RepaymentPageData, AuthState> = {
  async GET(_req, ctx) {
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

    const loanId = ctx.params.id;
    const tenantId = ctx.state.session.tenantId;

    const loan = await getLoanById(loanId, tenantId);
    if (!loan) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/bank/assessments" },
      });
    }

    const [repayments, summary] = await Promise.all([
      listRepaymentsByLoan(loanId),
      getLoanRepaymentSummary(loanId),
    ]);

    return ctx.render({
      loan: {
        id: loan.id,
        applicationNumber: loan.applicationNumber,
        customerName: loan.customerName || "Unknown",
        approvedAmount: loan.approvedAmount || loan.requestedAmount,
        interestRate: loan.interestRate || 7,
        tenureMonths: loan.tenureMonths || 12,
        status: loan.status,
      },
      repayments,
      summary,
    });
  },
};

export default function LoanRepaymentsPage(
  { data }: PageProps<RepaymentPageData>,
) {
  const { loan, repayments, summary } = data;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const outstanding = loan.approvedAmount - summary.totalPaid;
  const progressPercent = loan.approvedAmount > 0
    ? Math.min(100, (summary.totalPaid / loan.approvedAmount) * 100)
    : 0;

  return (
    <Layout title={`Repayments - ${loan.applicationNumber || loan.id}`}>
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white border-b">
          <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <a
                href={`/bank/assessment/${loan.id}`}
                class="text-gray-500 hover:text-gray-700"
              >
                ← Back
              </a>
              <div>
                <h1 class="text-xl font-bold text-gray-900">
                  Loan Repayments
                </h1>
                <p class="text-sm text-gray-500">
                  {loan.applicationNumber || loan.id.slice(0, 8)} •{" "}
                  {loan.customerName}
                </p>
              </div>
            </div>
            <span
              class={`px-3 py-1 rounded-full text-sm font-medium ${
                loan.status === "disbursed"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {loan.status}
            </span>
          </div>
        </header>

        <main class="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* Loan Summary */}
          <div class="bg-white rounded-xl p-6 border">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p class="text-sm text-gray-500">Loan Amount</p>
                <p class="text-xl font-bold text-gray-900">
                  {formatCurrency(loan.approvedAmount)}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Total Paid</p>
                <p class="text-xl font-bold text-green-600">
                  {formatCurrency(summary.totalPaid)}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Outstanding</p>
                <p class="text-xl font-bold text-orange-600">
                  {formatCurrency(outstanding)}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Payments Made</p>
                <p class="text-xl font-bold text-gray-900">
                  {summary.paymentCount}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div class="flex justify-between text-sm mb-2">
                <span class="text-gray-600">Repayment Progress</span>
                <span class="font-medium text-gray-900">
                  {progressPercent.toFixed(1)}%
                </span>
              </div>
              <div class="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Add Repayment */}
          {loan.status === "disbursed" && (
            <div class="bg-white rounded-xl p-6 border">
              <h2 class="font-semibold text-gray-900 mb-4">Record Payment</h2>
              <RepaymentForm loanId={loan.id} />
            </div>
          )}

          {/* Payment History */}
          <div class="bg-white rounded-xl border overflow-hidden">
            <div class="px-6 py-4 border-b">
              <h2 class="font-semibold text-gray-900">Payment History</h2>
            </div>

            {repayments.length > 0
              ? (
                <div class="divide-y">
                  {repayments.map((payment) => (
                    <div
                      key={payment.id}
                      class="px-6 py-4 flex items-center justify-between"
                    >
                      <div>
                        <p class="font-medium text-gray-900">
                          {formatCurrency(payment.amount)}
                        </p>
                        <p class="text-sm text-gray-500">
                          {new Date(payment.paymentDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                          {payment.paymentMethod &&
                            ` • ${payment.paymentMethod}`}
                        </p>
                        {payment.referenceNumber && (
                          <p class="text-xs text-gray-400">
                            Ref: {payment.referenceNumber}
                          </p>
                        )}
                      </div>
                      <div class="text-right">
                        {payment.principal && (
                          <p class="text-sm text-indigo-600">
                            P: {formatCurrency(payment.principal)}
                          </p>
                        )}
                        {payment.interest && (
                          <p class="text-sm text-orange-600">
                            I: {formatCurrency(payment.interest)}
                          </p>
                        )}
                        <span
                          class={`text-xs px-2 py-0.5 rounded ${
                            payment.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
              : (
                <div class="px-6 py-8 text-center text-gray-500">
                  No payments recorded yet
                </div>
              )}
          </div>
        </main>
      </div>
    </Layout>
  );
}
