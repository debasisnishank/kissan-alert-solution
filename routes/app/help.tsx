import { AppShell } from "$components/Layout.tsx";

const faqs = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "How do I add my farm?",
        a: "Go to 'My Farm' tab and tap 'Add Farm'. Draw your field boundary on the map or enter the location manually. Add crop details and save.",
      },
      {
        q: "What is NDVI and why is it important?",
        a: "NDVI (Normalized Difference Vegetation Index) measures crop health using satellite data. Values range from 0 to 1 - higher values indicate healthier, greener crops. We monitor this daily to detect problems early.",
      },
      {
        q: "How accurate is the satellite data?",
        a: "Our satellite data comes from Sentinel-2 with 10m resolution, updated every 5 days. Weather data is updated hourly. Combined with AI analysis, accuracy is 85-90% for health detection.",
      },
    ],
  },
  {
    category: "Alerts & Advisories",
    questions: [
      {
        q: "What types of alerts will I receive?",
        a: "You'll get alerts for: Water stress, Pest/disease risk, Weather warnings (rain, heat, frost), Harvest timing, Market price changes, and Government scheme deadlines.",
      },
      {
        q: "Can I customize which alerts I receive?",
        a: "Yes! Go to Settings > Alert Preferences to choose alert types. You can also set quiet hours to avoid notifications at night.",
      },
      {
        q: "What should I do when I get a pest alert?",
        a: "Check the affected area immediately. Use the Scan feature to photograph symptoms. The AI will suggest treatments. Contact your local dealer for recommended products.",
      },
    ],
  },
  {
    category: "AI Features",
    questions: [
      {
        q: "How do I use the AI assistant?",
        a: "Tap 'Ask AI' from home or use the floating chat button. Type or speak your question in Hindi or English. The AI knows about your farms and gives personalized advice.",
      },
      {
        q: "Can I scan my crops for problems?",
        a: "Yes! Use the Scan feature to take a photo of leaves, pests, or diseases. Our AI will identify the issue and suggest solutions within seconds.",
      },
      {
        q: "Does the AI work offline?",
        a: "Basic features work offline, but AI analysis requires internet. When offline, you'll see cached advisories and can save photos to analyze later.",
      },
    ],
  },
  {
    category: "Calendar & Planning",
    questions: [
      {
        q: "What is the Crop Calendar?",
        a: "The Calendar shows recommended activities based on your crop and growth stage - when to irrigate, fertilize, spray for pests, and harvest. Activities are customized for your sowing date.",
      },
      {
        q: "How are activity dates calculated?",
        a: "Based on your sowing date and crop type, we calculate optimal timing for each activity. Weather conditions may cause adjustments which appear as alerts.",
      },
    ],
  },
  {
    category: "Market & Services",
    questions: [
      {
        q: "Where does market price data come from?",
        a: "Prices are from Agmarknet (Government of India) updated daily. We show prices from your nearest mandi and major markets.",
      },
      {
        q: "How do I find nearby dealers?",
        a: "Go to Dealers page from Quick Actions. It shows fertilizer, pesticide, and seed dealers near you with contact numbers and ratings.",
      },
      {
        q: "What government schemes can I apply for?",
        a: "The Schemes page lists active PM-KISAN, crop insurance, subsidies, and state schemes. We show eligibility and deadlines based on your profile.",
      },
    ],
  },
  {
    category: "Account & Settings",
    questions: [
      {
        q: "How do I change my language?",
        a: "Go to Settings > Language. We support Hindi, Marathi, Gujarati, Punjabi, Tamil, Telugu, Kannada, Malayalam, Bengali, and Odia.",
      },
      {
        q: "How do I export my farm data?",
        a: "Open any farm detail page and tap 'Export'. You can download as CSV or PDF with all observations, alerts, and health history.",
      },
      {
        q: "Is my data secure?",
        a: "Yes. All data is encrypted and stored securely. We never share your personal information. You can delete your account anytime from Settings.",
      },
    ],
  },
];

const contactOptions = [
  {
    icon: "📞",
    title: "Helpline",
    desc: "1800-XXX-XXXX (Toll Free)",
    action: "tel:1800XXXXXXX",
  },
  {
    icon: "💬",
    title: "WhatsApp",
    desc: "+91 XXXXX XXXXX",
    action: "https://wa.me/91XXXXXXXXXX",
  },
  {
    icon: "📧",
    title: "Email",
    desc: "support@compass.agri",
    action: "mailto:support@compass.agri",
  },
  {
    icon: "🎥",
    title: "Video Tutorials",
    desc: "Watch on YouTube",
    action: "https://youtube.com/@compass-agri",
  },
];

export default function HelpPage() {
  return (
    <AppShell title="Help & FAQ" showBack>
      {/* Quick Contact */}
      <div class="bg-primary-50 rounded-xl p-4 mb-4">
        <h2 class="font-semibold text-primary-900 mb-3">Need Help?</h2>
        <div class="grid grid-cols-2 gap-2">
          {contactOptions.map((opt) => (
            <a
              key={opt.title}
              href={opt.action}
              class="flex items-center gap-2 p-3 bg-white rounded-lg"
            >
              <span class="text-xl">{opt.icon}</span>
              <div>
                <p class="font-medium text-gray-900 text-sm">{opt.title}</p>
                <p class="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Search */}
      <div class="mb-4">
        <input
          type="search"
          placeholder="Search help topics..."
          class="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* FAQ Sections */}
      <div class="space-y-4">
        {faqs.map((section) => (
          <div key={section.category} class="bg-white rounded-xl border">
            <div class="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
              <h3 class="font-semibold text-gray-900">{section.category}</h3>
            </div>
            <div class="divide-y">
              {section.questions.map((faq, idx) => (
                <details key={idx} class="group">
                  <summary class="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
                    <span class="font-medium text-gray-900 text-sm pr-4">
                      {faq.q}
                    </span>
                    <svg
                      class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </summary>
                  <div class="px-4 pb-4 text-sm text-gray-600">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* App Info */}
      <div class="mt-6 text-center text-sm text-gray-500">
        <p>Khetscope Agricultural Advisory Platform</p>
        <p>Version 1.0.0</p>
        <p class="mt-2">
          <a href="/app/settings" class="text-primary-600">Settings</a>
          {" · "}
          <a href="#" class="text-primary-600">Privacy Policy</a>
          {" · "}
          <a href="#" class="text-primary-600">Terms of Use</a>
        </p>
      </div>
    </AppShell>
  );
}
