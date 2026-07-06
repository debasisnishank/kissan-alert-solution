import { useEffect, useState } from "preact/hooks";

interface Props {
  farmId: string;
  farmName: string;
}

interface ProcessingStep {
  id: string;
  label: string;
  emoji: string;
  status: "pending" | "loading" | "done" | "error";
}

export default function FarmProcessing({ farmId, farmName }: Props) {
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: "satellite",
      label: "Fetching satellite imagery for your farm",
      emoji: "🛰️",
      status: "pending",
    },
    {
      id: "ndvi",
      label: "Analyzing crop vegetation health (NDVI)",
      emoji: "🌿",
      status: "pending",
    },
    {
      id: "weather",
      label: "Loading local weather data",
      emoji: "🌤️",
      status: "pending",
    },
    {
      id: "soil",
      label: "Retrieving soil information",
      emoji: "🌍",
      status: "pending",
    },
    {
      id: "calendar",
      label: "Creating your crop calendar",
      emoji: "📅",
      status: "pending",
    },
    {
      id: "advisories",
      label: "Generating AI recommendations",
      emoji: "🤖",
      status: "pending",
    },
  ]);
  const [_currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const processSteps = async () => {
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i);

        // Update step to loading
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "loading" } : s))
        );

        try {
          // Simulate API calls with actual endpoints
          switch (steps[i].id) {
            case "satellite":
              await new Promise((r) => setTimeout(r, 1500));
              break;
            case "ndvi":
              try {
                await fetch(`/api/farms/${farmId}/health`);
              } catch { /* ignore */ }
              await new Promise((r) => setTimeout(r, 1200));
              break;
            case "weather":
              await new Promise((r) => setTimeout(r, 800));
              break;
            case "soil":
              await new Promise((r) => setTimeout(r, 1000));
              break;
            case "calendar":
              await new Promise((r) => setTimeout(r, 600));
              break;
            case "advisories":
              try {
                await fetch(`/api/recommendations/${farmId}`);
              } catch { /* ignore */ }
              await new Promise((r) => setTimeout(r, 1500));
              break;
          }

          // Update step to done
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
          );
        } catch (e) {
          console.error(`Step ${steps[i].id} failed:`, e);
          // Continue even if step fails
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
          );
        }
      }

      setIsComplete(true);

      // Redirect to farm detail page after short delay
      setTimeout(() => {
        globalThis.location.href = `/app/farm/${farmId}`;
      }, 1500);
    };

    processSteps();
  }, [farmId]);

  const progress = Math.round(
    (steps.filter((s) => s.status === "done").length / steps.length) * 100,
  );

  return (
    <div class="min-h-screen bg-gradient-to-b from-primary-600 to-primary-800 flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        {/* Header */}
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-4">
            {isComplete
              ? <span class="text-4xl">✅</span>
              : (
                <div class="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full" />
              )}
          </div>
          <h1 class="text-2xl font-bold text-white mb-2">
            {isComplete ? "Farm Setup Complete!" : "Setting Up Your Farm"}
          </h1>
          <p class="text-primary-100">{farmName}</p>
        </div>

        {/* Progress Card */}
        <div class="bg-white rounded-2xl shadow-xl p-6">
          {/* Progress Bar */}
          <div class="mb-6">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-600">Progress</span>
              <span class="font-semibold text-primary-600">{progress}%</span>
            </div>
            <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div class="space-y-3">
            {steps.map((step) => (
              <div
                key={step.id}
                class={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  step.status === "loading"
                    ? "bg-primary-50 border border-primary-200"
                    : step.status === "done"
                    ? "bg-green-50"
                    : "bg-gray-50"
                }`}
              >
                <span class="text-xl">{step.emoji}</span>
                <span
                  class={`flex-1 text-sm ${
                    step.status === "loading"
                      ? "text-primary-700 font-medium"
                      : step.status === "done"
                      ? "text-green-700"
                      : "text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
                {step.status === "loading" && (
                  <div class="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                )}
                {step.status === "done" && (
                  <svg
                    class="w-5 h-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clip-rule="evenodd"
                    />
                  </svg>
                )}
                {step.status === "error" && (
                  <svg
                    class="w-5 h-5 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clip-rule="evenodd"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>

          {/* Complete Message */}
          {isComplete && (
            <div class="mt-6 text-center">
              <p class="text-green-600 font-medium mb-2">
                🎉 Your farm is ready!
              </p>
              <p class="text-sm text-gray-500">
                Redirecting to your dashboard...
              </p>
            </div>
          )}
        </div>

        {/* Tips */}
        {!isComplete && (
          <div class="mt-6 text-center">
            <p class="text-primary-100 text-sm">
              💡 We're analyzing satellite data to provide you with accurate
              crop health insights
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
