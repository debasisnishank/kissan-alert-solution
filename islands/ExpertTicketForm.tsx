import { useState } from "preact/hooks";

export default function ExpertTicketForm() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, category }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit question");
      }

      setSuccess(true);
      setSubject("");
      setDescription("");
      setCategory("general");

      // Reset success after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: "general", label: "General" },
    { id: "pest", label: "Pest Problem" },
    { id: "disease", label: "Crop Disease" },
    { id: "nutrient", label: "Nutrient/Fertilizer" },
    { id: "irrigation", label: "Irrigation/Water" },
  ];

  if (success) {
    return (
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <svg
          class="w-8 h-8 text-green-500 mx-auto mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p class="text-green-700 font-medium">Question submitted!</p>
        <p class="text-green-600 text-sm">
          An expert will respond within 24-48 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-3">
      {error && (
        <div class="bg-red-50 text-red-600 text-sm p-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onInput={(e) => setSubject((e.target as HTMLInputElement).value)}
          placeholder="Brief summary of your question"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm"
          required
          maxLength={200}
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onInput={(e) =>
            setDescription((e.target as HTMLTextAreaElement).value)}
          placeholder="Describe your problem in detail. Include crop type, symptoms, duration, etc."
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm h-24"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || !subject || !description}
        class="w-full bg-primary-600 text-white py-2 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 text-sm"
      >
        {loading ? "Submitting..." : "Submit Question"}
      </button>
    </form>
  );
}
