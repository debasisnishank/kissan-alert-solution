import { Layout } from "$components/Layout.tsx";
import { SITE_DESCRIPTION, SITE_NAME } from "$utils/constants.ts";

export default function LandingPage() {
  return (
    <Layout>
      <div class="min-h-screen bg-gradient-to-b from-primary-600 to-primary-800">
        {/* Header */}
        <header class="px-4 py-4">
          <div class="max-w-6xl mx-auto flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg
                class="w-8 h-8 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span class="text-xl font-bold text-white">{SITE_NAME}</span>
            </div>
            <nav class="flex items-center gap-4">
              <a
                href="/login"
                class="text-white hover:text-primary-100 text-sm font-medium"
              >
                Login
              </a>
              <a
                href="/login"
                class="bg-white text-primary-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-50"
              >
                Get Started
              </a>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <main class="px-4 py-16">
          <div class="max-w-4xl mx-auto text-center">
            <h1 class="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Smart Farming Advisories<br />
              <span class="text-primary-200">Powered by Satellites</span>
            </h1>
            <p class="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
              {SITE_DESCRIPTION}. Get personalized crop advisories, pest alerts,
              weather updates, and market intelligence - all in your language.
            </p>
            <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/login"
                class="w-full sm:w-auto bg-white text-primary-600 px-8 py-3 rounded-xl text-lg font-semibold hover:bg-primary-50 shadow-lg"
              >
                Start Free
              </a>
              <a
                href="#features"
                class="w-full sm:w-auto border-2 border-white text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-white/10"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Illustration placeholder */}
          <div class="max-w-2xl mx-auto mt-16">
            <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
              <div class="grid grid-cols-3 gap-4 text-center">
                <div class="p-4">
                  <div class="text-4xl font-bold text-white">50+</div>
                  <div class="text-sm text-primary-200">Crops Supported</div>
                </div>
                <div class="p-4">
                  <div class="text-4xl font-bold text-white">10+</div>
                  <div class="text-sm text-primary-200">Languages</div>
                </div>
                <div class="p-4">
                  <div class="text-4xl font-bold text-white">5-day</div>
                  <div class="text-sm text-primary-200">Satellite Updates</div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Features */}
        <section id="features" class="px-4 py-16 bg-white">
          <div class="max-w-6xl mx-auto">
            <h2 class="text-3xl font-bold text-gray-900 text-center mb-12">
              Everything Your Farm Needs
            </h2>
            <div class="grid md:grid-cols-3 gap-8">
              <FeatureCard
                icon="satellite"
                title="Satellite Monitoring"
                description="Track crop health with NDVI from Sentinel-2 & Landsat. Get alerts for stress, disease, and anomalies."
              />
              <FeatureCard
                icon="weather"
                title="Weather Intelligence"
                description="Rainfall forecasts, heat alerts, and irrigation advisories based on satellite weather data."
              />
              <FeatureCard
                icon="pest"
                title="Pest & Disease Alerts"
                description="Early warning system for pest outbreaks based on weather patterns and crop stage."
              />
              <FeatureCard
                icon="voice"
                title="Voice Advisories"
                description="Listen to alerts in your language. Hindi, Tamil, Telugu, Marathi and more supported."
              />
              <FeatureCard
                icon="market"
                title="Market Prices"
                description="Real-time mandi prices and harvest recommendations to maximize your returns."
              />
              <FeatureCard
                icon="schemes"
                title="Govt. Schemes"
                description="Discover eligible schemes, subsidies, and insurance programs with application guidance."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section class="px-4 py-16 bg-gray-50">
          <div class="max-w-2xl mx-auto text-center">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">
              Ready to Transform Your Farming?
            </h2>
            <p class="text-gray-600 mb-8">
              Join thousands of farmers already using Compass for smarter
              farming decisions.
            </p>
            <a
              href="/login"
              class="inline-block bg-primary-600 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-primary-700"
            >
              Get Started Free
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer class="bg-gray-900 text-gray-400 px-4 py-8">
          <div class="max-w-6xl mx-auto text-center">
            <p class="text-sm">
              &copy; {new Date().getFullYear()}{" "}
              {SITE_NAME}. Satellite data from ESA Copernicus & NASA.
            </p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}

function FeatureCard(
  { icon, title, description }: {
    icon: string;
    title: string;
    description: string;
  },
) {
  const icons: Record<string, preact.JSX.Element> = {
    satellite: (
      <svg
        class="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
    weather: (
      <svg
        class="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
        />
      </svg>
    ),
    pest: (
      <svg
        class="w-8 h-8"
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
    voice: (
      <svg
        class="w-8 h-8"
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
    ),
    market: (
      <svg
        class="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    schemes: (
      <svg
        class="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  };

  return (
    <div class="bg-white p-6 rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
      <div class="w-12 h-12 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center mb-4">
        {icons[icon]}
      </div>
      <h3 class="font-semibold text-gray-900 mb-2">{title}</h3>
      <p class="text-sm text-gray-600">{description}</p>
    </div>
  );
}
