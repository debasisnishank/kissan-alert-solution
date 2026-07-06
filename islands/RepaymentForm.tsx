import { useState } from "preact/hooks";

interface Props {
  loanId: string;
}

export default function RepaymentForm({ loanId }: Props) {
  const [amount, setAmount] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/bank/loans/${loanId}/repayments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          principal: principal ? parseFloat(principal) : undefined,
          interest: interest ? parseFloat(interest) : undefined,
          paymentDate,
          paymentMethod,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record payment");
      }

      setSuccess(true);
      setAmount("");
      setPrincipal("");
      setInterest("");
      setReferenceNumber("");
      setNotes("");

      // Refresh page to show new payment
      setTimeout(() => {
        globalThis.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      {error && (
        <div class="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div class="p-3 bg-green-100 text-green-700 rounded-lg text-sm">
          Payment recorded successfully!
        </div>
      )}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Amount *
          </label>
          <input
            type="number"
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
            required
            min="1"
            step="0.01"
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="10000"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Principal
          </label>
          <input
            type="number"
            value={principal}
            onInput={(e) => setPrincipal(e.currentTarget.value)}
            min="0"
            step="0.01"
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Interest
          </label>
          <input
            type="number"
            value={interest}
            onInput={(e) => setInterest(e.currentTarget.value)}
            min="0"
            step="0.01"
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Payment Date *
          </label>
          <input
            type="date"
            value={paymentDate}
            onInput={(e) => setPaymentDate(e.currentTarget.value)}
            required
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.currentTarget.value)}
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="upi">UPI</option>
            <option value="neft">NEFT</option>
            <option value="rtgs">RTGS</option>
            <option value="card">Card</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Reference No.
          </label>
          <input
            type="text"
            value={referenceNumber}
            onInput={(e) => setReferenceNumber(e.currentTarget.value)}
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="Transaction ID"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onInput={(e) => setNotes(e.currentTarget.value)}
          rows={2}
          class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          placeholder="Optional notes..."
        />
      </div>

      <button
        type="submit"
        disabled={loading || !amount}
        class="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "Recording..." : "Record Payment"}
      </button>
    </form>
  );
}
