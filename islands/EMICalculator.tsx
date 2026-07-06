import { useState } from "preact/hooks";
import { calculateEMI } from "$lib/bank.ts";

export default function EMICalculator() {
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(7);
  const [tenure, setTenure] = useState(12);
  const [showSchedule, setShowSchedule] = useState(false);

  const emi = calculateEMI(principal, rate, tenure);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div class="space-y-6">
      {/* Input Section */}
      <div class="bg-white rounded-xl p-6 border">
        <h2 class="font-semibold text-gray-900 mb-4">Loan Details</h2>

        <div class="space-y-6">
          {/* Principal */}
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">
                Loan Amount
              </label>
              <span class="text-sm font-semibold text-indigo-600">
                {formatCurrency(principal)}
              </span>
            </div>
            <input
              type="range"
              min="10000"
              max="1000000"
              step="10000"
              value={principal}
              onInput={(e) => setPrincipal(Number(e.currentTarget.value))}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>₹10,000</span>
              <span>₹10,00,000</span>
            </div>
          </div>

          {/* Interest Rate */}
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">
                Interest Rate (p.a.)
              </label>
              <span class="text-sm font-semibold text-indigo-600">{rate}%</span>
            </div>
            <input
              type="range"
              min="4"
              max="18"
              step="0.5"
              value={rate}
              onInput={(e) => setRate(Number(e.currentTarget.value))}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>4%</span>
              <span>18%</span>
            </div>
          </div>

          {/* Tenure */}
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">
                Loan Tenure
              </label>
              <span class="text-sm font-semibold text-indigo-600">
                {tenure} months
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="60"
              step="3"
              value={tenure}
              onInput={(e) => setTenure(Number(e.currentTarget.value))}
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>3 months</span>
              <span>60 months</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div class="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-6 text-white">
        <div class="text-center mb-6">
          <p class="text-indigo-200 text-sm mb-1">Monthly EMI</p>
          <p class="text-4xl font-bold">{formatCurrency(emi.emiAmount)}</p>
        </div>

        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-indigo-200 text-xs mb-1">Principal</p>
            <p class="text-lg font-semibold">{formatCurrency(principal)}</p>
          </div>
          <div>
            <p class="text-indigo-200 text-xs mb-1">Total Interest</p>
            <p class="text-lg font-semibold">
              {formatCurrency(emi.totalInterest)}
            </p>
          </div>
          <div>
            <p class="text-indigo-200 text-xs mb-1">Total Payable</p>
            <p class="text-lg font-semibold">
              {formatCurrency(emi.totalPayable)}
            </p>
          </div>
        </div>
      </div>

      {/* Visual Breakdown */}
      <div class="bg-white rounded-xl p-6 border">
        <h3 class="font-semibold text-gray-900 mb-4">Payment Breakdown</h3>
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <div class="h-8 rounded-lg overflow-hidden flex">
              <div
                class="bg-indigo-500 flex items-center justify-center text-white text-xs font-medium"
                style={{
                  width: `${(principal / emi.totalPayable) * 100}%`,
                }}
              >
                Principal
              </div>
              <div
                class="bg-orange-400 flex items-center justify-center text-white text-xs font-medium"
                style={{
                  width: `${(emi.totalInterest / emi.totalPayable) * 100}%`,
                }}
              >
                Interest
              </div>
            </div>
            <div class="flex justify-between mt-2 text-sm">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded bg-indigo-500" />
                <span class="text-gray-600">
                  Principal ({((principal / emi.totalPayable) * 100).toFixed(1)}
                  %)
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded bg-orange-400" />
                <span class="text-gray-600">
                  Interest (
                  {((emi.totalInterest / emi.totalPayable) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EMI Schedule Toggle */}
      <button
        type="button"
        onClick={() => setShowSchedule(!showSchedule)}
        class="w-full py-3 bg-white border border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50"
      >
        {showSchedule ? "Hide" : "Show"} EMI Schedule
      </button>

      {/* EMI Schedule Table */}
      {showSchedule && (
        <div class="bg-white rounded-xl border overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Month
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    EMI
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Principal
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Interest
                  </th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {emi.schedule.map((row) => (
                  <tr key={row.month} class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-900">{row.month}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(row.emiAmount)}
                    </td>
                    <td class="px-4 py-3 text-sm text-indigo-600 text-right font-medium">
                      {formatCurrency(row.principal)}
                    </td>
                    <td class="px-4 py-3 text-sm text-orange-600 text-right">
                      {formatCurrency(row.interest)}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-500 text-right">
                      {formatCurrency(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
