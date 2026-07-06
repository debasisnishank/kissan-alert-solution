interface AlertCardProps {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  timestamp: string;
  audioUrl?: string;
  actions?: { label: string; type: string; value: string }[];
  onDismiss?: (id: string) => void;
}

export function AlertCard({
  id,
  type,
  severity,
  title,
  message,
  timestamp,
  audioUrl,
  actions,
  onDismiss,
}: AlertCardProps) {
  const severityColors = {
    low: "border-l-blue-400 bg-blue-50",
    medium: "border-l-yellow-400 bg-yellow-50",
    high: "border-l-orange-400 bg-orange-50",
    critical: "border-l-red-400 bg-red-50",
  };

  const severityIcons = {
    low: (
      <svg
        class="w-5 h-5 text-blue-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    medium: (
      <svg
        class="w-5 h-5 text-yellow-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    high: (
      <svg
        class="w-5 h-5 text-orange-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    critical: (
      <svg
        class="w-5 h-5 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
  };

  const typeLabels: Record<string, string> = {
    weather: "Weather",
    pest: "Pest",
    disease: "Disease",
    weed: "Weed",
    nutrient: "Nutrient",
    irrigation: "Irrigation",
    harvest: "Harvest",
    market: "Market",
    scheme: "Scheme",
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  return (
    <div
      class={`rounded-lg border-l-4 p-4 mb-3 shadow-sm ${
        severityColors[severity]
      }`}
    >
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 mt-0.5">{severityIcons[severity]}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {typeLabels[type] || type}
            </span>
            <span class="text-xs text-gray-400">{formatTime(timestamp)}</span>
          </div>
          <h3 class="font-semibold text-gray-900 text-sm leading-tight mb-1">
            {title || "Alert"}
          </h3>
          {message && (
            <p class="text-sm text-gray-600 leading-snug">{message}</p>
          )}

          {/* Audio Player */}
          {audioUrl && (
            <div class="mt-3 flex items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700"
                onClick={() => {
                  const audio = new Audio(audioUrl);
                  audio.play();
                }}
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
                Listen
              </button>
            </div>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div class="mt-3 flex flex-wrap gap-2">
              {actions.map((action, idx) => (
                <button
                  type="button"
                  key={idx}
                  class={`text-xs px-3 py-1.5 rounded-full font-medium ${
                    action.type === "action"
                      ? "bg-primary-100 text-primary-700 hover:bg-primary-200"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => {
                    if (
                      action.type === "action" && action.value === "dismiss"
                    ) {
                      onDismiss?.(id);
                    } else if (action.type === "link") {
                      globalThis.location.href = action.value;
                    }
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
