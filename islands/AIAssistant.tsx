import { useSignal } from "@preact/signals";
import { Fragment } from "preact";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** Renders **bold** markers and numbered-list items from plain-text AI
 * responses without pulling in a full markdown parser. */
function formatMessage(content: string) {
  const withLineBreaks = content
    .replace(/\s(\d{1,2}\.\s+)(?=\*\*)/g, "\n$1")
    .trim();

  return withLineBreaks.split("\n").map((line, i) => (
    <div key={i} class={i > 0 ? "mt-1.5" : ""}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        const boldMatch = part.match(/^\*\*(.+)\*\*$/);
        return boldMatch
          ? <strong key={j}>{boldMatch[1]}</strong>
          : <Fragment key={j}>{part}</Fragment>;
      })}
    </div>
  ));
}

interface Props {
  farmName?: string;
  location?: string;
  activeCrop?: string;
  cropStage?: string;
  healthScore?: number;
  daysAfterSowing?: number;
}

export default function AIAssistant({
  farmName,
  location,
  activeCrop,
  cropStage,
  healthScore,
  daysAfterSowing,
}: Props = {}) {
  const isOpen = useSignal(false);
  const messages = useSignal<Message[]>([]);
  const input = useSignal("");
  const isLoading = useSignal(false);
  const isListening = useSignal(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading.value) return;

    const userMessage = text.trim();
    input.value = "";
    messages.value = [...messages.value, {
      role: "user",
      content: userMessage,
    }];
    isLoading.value = true;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: {
            farmName: farmName || null,
            location: location || "India",
            activeCrop: activeCrop || null,
            cropStage: cropStage || null,
            healthScore: healthScore || null,
            daysAfterSowing: daysAfterSowing || null,
            season: new Date().getMonth() >= 5 && new Date().getMonth() <= 9
              ? "kharif"
              : "rabi",
          },
        }),
      });

      const data = await response.json();
      messages.value = [
        ...messages.value,
        {
          role: "assistant",
          content: data.response ||
            "I couldn't process that. Please try again.",
        },
      ];
    } catch {
      messages.value = [
        ...messages.value,
        {
          role: "assistant",
          content: "Sorry, I'm having trouble connecting. Please try again.",
        },
      ];
    } finally {
      isLoading.value = false;
    }
  };

  const startVoiceInput = () => {
    // deno-lint-ignore no-explicit-any
    const win = globalThis as any;
    if (!win.webkitSpeechRecognition && !win.SpeechRecognition) {
      alert("Voice input not supported in this browser");
      return;
    }

    const SpeechRecognition = win.webkitSpeechRecognition ||
      win.SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      isListening.value = true;
    };

    // deno-lint-ignore no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      sendMessage(transcript);
    };

    recognition.onerror = () => {
      isListening.value = false;
    };

    recognition.onend = () => {
      isListening.value = false;
    };

    recognition.start();
  };

  return (
    <>
      {/* Floating Button */}
      <button
        type="button"
        onClick={() => (isOpen.value = !isOpen.value)}
        class="fixed bottom-20 right-4 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 z-50"
        aria-label="AI Assistant"
      >
        {isOpen.value
          ? (
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )
          : (
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          )}
      </button>

      {/* Chat Panel */}
      {isOpen.value && (
        <div class="fixed bottom-36 right-4 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div class="bg-primary-600 text-white px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p class="font-semibold text-sm">Agri AI Assistant</p>
                <p class="text-xs text-white/70">
                  Ask me anything about farming
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div class="h-64 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {messages.value.length === 0 && (
              <div class="text-center text-gray-500 text-sm py-8">
                <p>Hi! How can I help you today?</p>
                <p class="text-xs mt-1">Ask about crops, weather, pests...</p>
              </div>
            )}
            {messages.value.map((msg, i) => (
              <div
                key={i}
                class={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  class={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    msg.role === "user"
                      ? "bg-primary-600 text-white rounded-br-none"
                      : "bg-white text-gray-800 border rounded-bl-none"
                  }`}
                >
                  {msg.role === "assistant"
                    ? formatMessage(msg.content)
                    : msg.content}
                </div>
              </div>
            ))}
            {isLoading.value && (
              <div class="flex justify-start">
                <div class="bg-white border rounded-lg px-3 py-2 text-sm text-gray-500">
                  <span class="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div class="p-3 border-t bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input.value);
              }}
              class="flex gap-2"
            >
              <button
                type="button"
                onClick={startVoiceInput}
                class={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isListening.value
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </button>
              <input
                type="text"
                value={input.value}
                onInput={(
                  e,
                ) => (input.value = (e.target as HTMLInputElement).value)}
                placeholder="Type a message..."
                class="flex-1 px-3 py-2 border rounded-full text-sm focus:outline-none focus:border-primary-500"
              />
              <button
                type="submit"
                disabled={isLoading.value || !input.value.trim()}
                class="w-9 h-9 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 disabled:opacity-50"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
