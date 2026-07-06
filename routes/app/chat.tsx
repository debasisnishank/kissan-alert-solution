import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmsByFarmer } from "$lib/farm.ts";
import type { AuthState } from "../../middlewares/auth.ts";

interface ChatPageData {
  user: { name: string; language: string };
  context: {
    location: string;
    activeCrop: string | null;
    cropStage: string | null;
    season: string;
  };
}

export const handler: Handlers<ChatPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session, user } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    let activeCrop = null;
    let cropStage = null;
    let location = "India";

    if (farms.length > 0) {
      const farm = farms[0];
      location = `${farm.district || "Unknown"}, ${farm.state || "India"}`;

      const crop = await getActiveCropByFarm(farm.id);
      if (crop) {
        activeCrop = crop.cropType;
        const daysAfterSowing = Math.floor(
          (Date.now() - new Date(crop.sowingDate).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysAfterSowing < 15) cropStage = "Germination";
        else if (daysAfterSowing < 30) cropStage = "Seedling";
        else if (daysAfterSowing < 50) cropStage = "Vegetative";
        else if (daysAfterSowing < 70) cropStage = "Flowering";
        else if (daysAfterSowing < 90) cropStage = "Pod Formation";
        else cropStage = "Maturity";
      }
    }

    // Determine season
    const month = new Date().getMonth();
    const season = month >= 5 && month <= 9
      ? "Kharif"
      : month >= 10 || month <= 2
      ? "Rabi"
      : "Zaid";

    return ctx.render({
      user: { name: user.name, language: user.language },
      context: { location, activeCrop, cropStage, season },
    });
  },
};

export default function ChatPage({ data }: PageProps<ChatPageData>) {
  const { user, context } = data;

  return (
    <AppShell title="Agri AI Assistant" showBack>
      {/* Context Banner */}
      <div class="bg-primary-50 border border-primary-100 rounded-lg p-3 mb-4 text-sm">
        <div class="flex items-center gap-2 text-primary-700">
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
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
          </svg>
          <span>{context.location}</span>
          {context.activeCrop && (
            <>
              <span class="text-primary-400">•</span>
              <span class="capitalize">{context.activeCrop}</span>
              {context.cropStage && (
                <span class="text-primary-500">({context.cropStage})</span>
              )}
            </>
          )}
          <span class="text-primary-400">•</span>
          <span>{context.season} Season</span>
        </div>
      </div>

      {/* Chat Interface */}
      <div
        id="chat-container"
        class="bg-white rounded-xl border border-gray-100 overflow-hidden"
        style="height: calc(100vh - 280px); min-height: 400px;"
      >
        {/* Messages Area */}
        <div
          id="messages"
          class="h-full overflow-y-auto p-4 space-y-4"
          style="padding-bottom: 80px;"
        >
          {/* Welcome Message */}
          <div class="flex gap-3">
            <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg
                class="w-5 h-5 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div class="bg-gray-50 rounded-lg rounded-tl-none p-3 max-w-[85%]">
              <p class="text-sm text-gray-800">
                Namaste{" "}
                {user.name.split(" ")[0]}! I'm your Agri AI assistant. I can
                help you with:
              </p>
              <ul class="text-sm text-gray-600 mt-2 space-y-1">
                <li>• Crop health and disease diagnosis</li>
                <li>• Fertilizer and irrigation guidance</li>
                <li>• Weather-based recommendations</li>
                <li>• Pest management advice</li>
                <li>• Government schemes information</li>
              </ul>
              <p class="text-sm text-gray-800 mt-2">
                How can I help you today?
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="quick-question px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100"
              data-question="What should I do for my crop this week?"
            >
              Weekly advice
            </button>
            <button
              type="button"
              class="quick-question px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100"
              data-question="My crop leaves are turning yellow. What could be wrong?"
            >
              Yellow leaves
            </button>
            <button
              type="button"
              class="quick-question px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100"
              data-question="When should I irrigate my field?"
            >
              Irrigation timing
            </button>
            <button
              type="button"
              class="quick-question px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100"
              data-question="Which fertilizer should I apply now?"
            >
              Fertilizer advice
            </button>
          </div>
        </div>

        {/* Input Area */}
        <div class="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3">
          <form id="chat-form" class="flex gap-2">
            {/* Voice Button */}
            <button
              type="button"
              id="voice-btn"
              class="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-200"
              title="Voice Input"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <input
              type="text"
              id="chat-input"
              name="message"
              placeholder="Type your question..."
              class="flex-1 px-4 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:border-primary-500"
              autocomplete="off"
            />
            <button
              type="submit"
              class="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
          <p
            id="voice-status"
            class="hidden text-center text-xs text-primary-600 mt-2"
          >
            Listening...
          </p>
        </div>
      </div>

      {/* Voice Agent Modal */}
      <div
        id="voice-modal"
        class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      >
        <div class="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full text-center">
          <div
            id="voice-animation"
            class="w-24 h-24 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center"
          >
            <svg
              class="w-12 h-12 text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 mb-2">Voice Assistant</h3>
          <p id="voice-modal-status" class="text-sm text-gray-600 mb-4">
            Tap to start speaking
          </p>
          <div class="flex gap-3 justify-center">
            <button
              type="button"
              id="start-voice"
              class="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
            >
              Start
            </button>
            <button
              type="button"
              id="close-voice-modal"
              class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Chat Script */}
      {/* deno-lint-ignore react-no-danger */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const messagesDiv = document.getElementById('messages');
            const chatForm = document.getElementById('chat-form');
            const chatInput = document.getElementById('chat-input');
            const context = ${JSON.stringify(context)};

            // Quick question buttons
            document.querySelectorAll('.quick-question').forEach(btn => {
              btn.addEventListener('click', () => {
                chatInput.value = btn.dataset.question;
                chatForm.dispatchEvent(new Event('submit'));
              });
            });

            chatForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const message = chatInput.value.trim();
              if (!message) return;

              // Add user message
              addMessage(message, 'user');
              chatInput.value = '';

              // Show typing indicator
              const typingId = showTyping();

              try {
                const response = await fetch('/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message, context }),
                });

                const data = await response.json();
                removeTyping(typingId);

                if (data.response) {
                  addMessage(data.response, 'ai');
                } else {
                  addMessage('Sorry, I could not process that. Please try again.', 'ai');
                }
              } catch (err) {
                removeTyping(typingId);
                addMessage('Connection error. Please check your internet and try again.', 'ai');
              }
            });

            function addMessage(text, type) {
              const div = document.createElement('div');
              div.className = 'flex gap-3 ' + (type === 'user' ? 'justify-end' : '');
              
              if (type === 'user') {
                div.innerHTML = \`
                  <div class="bg-primary-600 text-white rounded-lg rounded-tr-none p-3 max-w-[85%]">
                    <p class="text-sm">\${escapeHtml(text)}</p>
                  </div>
                \`;
              } else {
                div.innerHTML = \`
                  <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div class="bg-gray-50 rounded-lg rounded-tl-none p-3 max-w-[85%]">
                    <div class="text-sm text-gray-800 whitespace-pre-wrap">\${formatResponse(text)}</div>
                  </div>
                \`;
              }

              messagesDiv.appendChild(div);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            function showTyping() {
              const id = 'typing-' + Date.now();
              const div = document.createElement('div');
              div.id = id;
              div.className = 'flex gap-3';
              div.innerHTML = \`
                <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div class="bg-gray-50 rounded-lg rounded-tl-none p-3">
                  <div class="flex gap-1">
                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                    <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                  </div>
                </div>
              \`;
              messagesDiv.appendChild(div);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
              return id;
            }

            function removeTyping(id) {
              document.getElementById(id)?.remove();
            }

            function escapeHtml(text) {
              const div = document.createElement('div');
              div.textContent = text;
              return div.innerHTML;
            }

            function formatResponse(text) {
              return text
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\n/g, '<br>');
            }

            // Voice functionality
            const voiceBtn = document.getElementById('voice-btn');
            const voiceModal = document.getElementById('voice-modal');
            const startVoiceBtn = document.getElementById('start-voice');
            const closeVoiceModalBtn = document.getElementById('close-voice-modal');
            const voiceModalStatus = document.getElementById('voice-modal-status');
            const voiceAnimation = document.getElementById('voice-animation');

            let recognition = null;
            let isListening = false;

            // Check for Web Speech API
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
              const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              recognition = new SpeechRecognition();
              recognition.continuous = false;
              recognition.interimResults = true;
              recognition.lang = 'hi-IN'; // Hindi by default, can be changed

              recognition.onstart = () => {
                isListening = true;
                voiceModalStatus.textContent = 'Listening... Speak now';
                voiceAnimation.classList.add('animate-pulse');
                startVoiceBtn.textContent = 'Stop';
              };

              recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                  .map(result => result[0].transcript)
                  .join('');
                voiceModalStatus.textContent = transcript || 'Listening...';
                
                if (event.results[0].isFinal) {
                  chatInput.value = transcript;
                  voiceModal.classList.add('hidden');
                  chatForm.dispatchEvent(new Event('submit'));
                }
              };

              recognition.onerror = (event) => {
                voiceModalStatus.textContent = 'Error: ' + event.error;
                isListening = false;
                startVoiceBtn.textContent = 'Start';
                voiceAnimation.classList.remove('animate-pulse');
              };

              recognition.onend = () => {
                isListening = false;
                startVoiceBtn.textContent = 'Start';
                voiceAnimation.classList.remove('animate-pulse');
              };
            }

            voiceBtn.addEventListener('click', () => {
              if (recognition) {
                voiceModal.classList.remove('hidden');
              } else {
                alert('Voice recognition is not supported in your browser. Please type your question instead.');
              }
            });

            startVoiceBtn.addEventListener('click', () => {
              if (recognition) {
                if (isListening) {
                  recognition.stop();
                } else {
                  recognition.start();
                }
              }
            });

            closeVoiceModalBtn.addEventListener('click', () => {
              if (recognition && isListening) {
                recognition.stop();
              }
              voiceModal.classList.add('hidden');
              voiceModalStatus.textContent = 'Tap to start speaking';
            });
          `,
        }}
      />
    </AppShell>
  );
}
