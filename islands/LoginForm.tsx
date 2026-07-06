import { useState } from "preact/hooks";

type Step = "login" | "register" | "change_password";

/** Land each role on its own home instead of the farmer app */
function homeForRole(role?: string): string {
  switch (role) {
    case "admin":
    case "tenant_admin":
      return "/admin";
    case "bank_officer":
      return "/bank";
    default:
      return "/app";
  }
}

export default function LoginForm() {
  const [step, setStep] = useState<Step>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Used when login returns forcePasswordChange
  const [forceChange, setForceChange] = useState(false);

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      if (data.forcePasswordChange) {
        setForceChange(true);
        setStep("change_password");
        return;
      }

      globalThis.location.href = homeForRole(data.user?.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          username,
          password,
          name,
          email: email || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      globalThis.location.href = homeForRole(data.user?.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          username,
          currentPassword: password,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password change failed");

      globalThis.location.href = homeForRole(data.user?.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* LOGIN */}
      {step === "login" && (
        <form onSubmit={handleLogin}>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onInput={(e) =>
                  setUsername((e.target as HTMLInputElement).value)}
                placeholder="Enter your username"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                autoFocus
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div class="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onInput={(e) =>
                    setPassword((e.target as HTMLInputElement).value)}
                  placeholder="Enter your password"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            class="w-full mt-6 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p class="text-center text-sm text-gray-500 mt-4">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setStep("register");
                setError("");
              }}
              class="text-primary-600 hover:underline font-medium"
            >
              Create Account
            </button>
          </p>
        </form>
      )}

      {/* REGISTER */}
      {step === "register" && (
        <form onSubmit={handleRegister}>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
                placeholder="Enter your full name"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={2}
                autoFocus
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Username <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onInput={(e) =>
                  setUsername((e.target as HTMLInputElement).value)}
                placeholder="Choose a username"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={3}
                pattern="[a-zA-Z0-9_]+"
              />
              <p class="text-xs text-gray-400 mt-1">
                Letters, numbers, and underscores only
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Email <span class="text-gray-400">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="your@email.com"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Password <span class="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onInput={(e) =>
                  setPassword((e.target as HTMLInputElement).value)}
                placeholder="At least 6 characters"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={6}
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password <span class="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onInput={(e) =>
                  setConfirmPassword((e.target as HTMLInputElement).value)}
                placeholder="Re-enter password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password || !name}
            class="w-full mt-6 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          <p class="text-center text-sm text-gray-500 mt-4">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setStep("login");
                setError("");
              }}
              class="text-primary-600 hover:underline font-medium"
            >
              Sign In
            </button>
          </p>
        </form>
      )}

      {/* CHANGE PASSWORD (forced) */}
      {step === "change_password" && (
        <form onSubmit={handleChangePassword}>
          {forceChange && (
            <div class="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg mb-4">
              You must change your password before continuing.
            </div>
          )}

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onInput={(e) =>
                  setNewPassword((e.target as HTMLInputElement).value)}
                placeholder="At least 6 characters"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={6}
                autoFocus
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onInput={(e) =>
                  setConfirmPassword((e.target as HTMLInputElement).value)}
                placeholder="Re-enter new password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            class="w-full mt-6 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Changing Password..." : "Change Password"}
          </button>
        </form>
      )}
    </div>
  );
}
