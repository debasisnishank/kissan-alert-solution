import { useState } from "preact/hooks";

interface Props {
  userId: string;
  initialName: string;
  initialEmail: string;
  phone: string;
}

export default function ProfileEditForm({
  userId: _userId,
  initialName,
  initialEmail,
  phone,
}: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess(true);
      setTimeout(() => {
        globalThis.location.href = "/app/profile";
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
        <div class="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div class="p-3 bg-green-50 text-green-600 rounded-lg text-sm">
          Profile updated successfully! Redirecting...
        </div>
      )}

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500"
          placeholder="Enter your name"
          required
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Phone Number
        </label>
        <input
          type="tel"
          value={phone}
          class="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
          disabled
        />
        <p class="text-xs text-gray-400 mt-1">Phone number cannot be changed</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          type="email"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500"
          placeholder="Enter your email"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
