import { Head } from "$fresh/runtime.ts";
import { Layout } from "$components/Layout.tsx";
import { SITE_NAME, SUPPORTED_LANGUAGES } from "$utils/constants.ts";

/**
 * Landing page — the visual thesis is "read your field from orbit".
 * The hero centres on a satellite NDVI plot readout (the actual product),
 * the rest of the page walks through how public satellite/soil/weather data
 * becomes plain-language advice in the farmer's own language.
 */

// A small NDVI false-colour plot: greens = vigorous, gold/brown = stressed.
// The dip around cols 4-5 / rows 3-4 is a deliberate "detected stress zone".
const PLOT: number[][] = [
  [0.62, 0.68, 0.71, 0.74, 0.70, 0.66, 0.60, 0.55],
  [0.66, 0.72, 0.78, 0.80, 0.76, 0.70, 0.64, 0.58],
  [0.70, 0.76, 0.82, 0.35, 0.30, 0.72, 0.68, 0.60],
  [0.64, 0.70, 0.75, 0.40, 0.28, 0.68, 0.66, 0.58],
  [0.58, 0.62, 0.66, 0.68, 0.64, 0.60, 0.55, 0.50],
];

/** NDVI value → false-colour, matching how remote-sensing maps read. */
function ndviColor(v: number): string {
  if (v < 0.2) return "#8c4b3a"; // bare / severely stressed soil
  if (v < 0.32) return "#a95f44";
  if (v < 0.42) return "#eab308"; // sparse, emerging
  if (v < 0.55) return "#a3c614"; // moderate
  if (v < 0.68) return "#4ade80"; // healthy
  if (v < 0.78) return "#16a34a"; // vigorous
  return "#166534"; // dense canopy
}

export default function LandingPage() {
  return (
    <Layout>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .cmp-topo{
              background-color:#052e16;
              background-image:
                radial-gradient(120% 90% at 85% -10%, rgba(74,222,128,.16), transparent 55%),
                radial-gradient(90% 70% at 0% 110%, rgba(234,179,8,.12), transparent 50%),
                repeating-radial-gradient(circle at 78% 18%, rgba(134,239,172,.06) 0 1px, transparent 1px 26px),
                linear-gradient(180deg,#0b3a20 0%,#052e16 60%,#04240f 100%);
            }
            .cmp-grid-lines{
              background-image:
                linear-gradient(rgba(134,239,172,.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(134,239,172,.08) 1px, transparent 1px);
              background-size:34px 34px;
            }
            .cmp-scan{
              position:absolute; inset:0; overflow:hidden; border-radius:14px; pointer-events:none;
            }
            .cmp-scan::after{
              content:""; position:absolute; left:0; right:0; height:38%;
              background:linear-gradient(180deg, transparent, rgba(190,242,100,.35), transparent);
              mix-blend-mode:screen;
              animation:cmp-sweep 4.2s cubic-bezier(.4,0,.2,1) infinite;
            }
            @keyframes cmp-sweep{
              0%{transform:translateY(-40%)} 100%{transform:translateY(160%)}
            }
            .cmp-rise{opacity:0; transform:translateY(14px); animation:cmp-rise .7s cubic-bezier(.2,.7,.2,1) forwards;}
            .cmp-d1{animation-delay:.05s}.cmp-d2{animation-delay:.15s}.cmp-d3{animation-delay:.25s}
            .cmp-d4{animation-delay:.35s}.cmp-d5{animation-delay:.45s}
            @keyframes cmp-rise{to{opacity:1; transform:none}}
            .cmp-dot{animation:cmp-pulse 1.6s ease-in-out infinite;}
            @keyframes cmp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
            .cmp-ring{animation:cmp-ring 2.4s ease-in-out infinite;}
            @keyframes cmp-ring{0%,100%{box-shadow:0 0 0 0 rgba(250,204,21,.6)}50%{box-shadow:0 0 0 6px rgba(250,204,21,0)}}
            .cmp-marquee{animation:cmp-slide 32s linear infinite;}
            @keyframes cmp-slide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
            .cmp-link:focus-visible{outline:2px solid #facc15; outline-offset:3px; border-radius:8px;}
            @media (prefers-reduced-motion: reduce){
              .cmp-scan::after,.cmp-rise,.cmp-dot,.cmp-ring,.cmp-marquee{animation:none!important}
              .cmp-rise{opacity:1;transform:none}
            }
          `,
          }}
        />
      </Head>

      <div class="bg-[#04240f] text-white antialiased overflow-x-hidden">
        {/* ── Header ─────────────────────────────────────────── */}
        <header class="cmp-topo relative">
          <div class="absolute inset-0 cmp-grid-lines opacity-40" aria-hidden />
          <div class="relative max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
            <a href="/" class="cmp-link flex items-center gap-2.5">
              <span class="w-9 h-9 rounded-xl bg-primary-400 text-[#04240f] grid place-items-center shadow-lg shadow-primary-500/20">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </span>
              <span class="text-lg font-semibold tracking-tight">
                {SITE_NAME}
              </span>
            </a>
            <nav class="flex items-center gap-3 sm:gap-5 text-sm">
              <a
                href="#how"
                class="cmp-link hidden sm:inline text-primary-100/80 hover:text-white font-medium"
              >
                How it works
              </a>
              <a
                href="/login"
                class="cmp-link text-primary-100/80 hover:text-white font-medium"
              >
                Login
              </a>
              <a
                href="/login"
                class="cmp-link bg-secondary-400 text-[#04240f] px-4 py-2 rounded-lg font-semibold hover:bg-secondary-300 transition-colors"
              >
                Get started
              </a>
            </nav>
          </div>

          {/* ── Hero ─────────────────────────────────────────── */}
          <div class="relative max-w-6xl mx-auto px-5 pt-10 pb-20 md:pt-16 md:pb-28 grid md:grid-cols-2 gap-12 md:gap-8 items-center">
            {/* Left: the thesis */}
            <div>
              <p class="cmp-rise cmp-d1 font-tech text-[11px] sm:text-xs tracking-[0.22em] text-secondary-300 mb-5">
                SATELLITE ADVISORY · FIELD-LEVEL · FREE DATA
              </p>
              <h1 class="cmp-rise cmp-d2 font-display font-semibold leading-[1.02] tracking-tight text-[2.6rem] sm:text-6xl">
                Read your fields
                <br />
                <span class="text-primary-300 italic">from orbit.</span>
              </h1>
              <p class="cmp-rise cmp-d3 mt-6 text-base sm:text-lg text-primary-100/80 max-w-md leading-relaxed">
                {SITE_NAME}{" "}
                turns free satellite, soil, and weather data into plain crop
                advice — pest warnings, irrigation timing, and mandi prices,
                spoken in your language.
              </p>
              <div class="cmp-rise cmp-d4 mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
                <a
                  href="/login"
                  class="cmp-link bg-secondary-400 text-[#04240f] px-6 py-3.5 rounded-xl text-base font-semibold hover:bg-secondary-300 shadow-lg shadow-secondary-500/20 text-center transition-colors"
                >
                  Start free
                </a>
                <a
                  href="#how"
                  class="cmp-link px-6 py-3.5 rounded-xl text-base font-semibold text-white border border-white/25 hover:bg-white/10 text-center transition-colors"
                >
                  See how it works
                </a>
              </div>
              <p class="cmp-rise cmp-d5 mt-7 font-tech text-[11px] text-primary-200/60 tracking-wide">
                PUBLIC DATA ONLY · SENTINEL-2 · ISRO BHUVAN · SOILGRIDS ·
                OPEN-METEO
              </p>
            </div>

            {/* Right: the signature — a satellite NDVI plot readout */}
            <div class="cmp-rise cmp-d3">
              <figure
                class="relative rounded-2xl bg-[#0a3018]/80 border border-primary-400/25 p-4 sm:p-5 shadow-2xl shadow-black/40 backdrop-blur-sm"
                role="img"
                aria-label="Satellite NDVI scan of a farm plot showing mostly healthy vegetation with a detected stress zone near the centre."
              >
                {/* readout header */}
                <div class="flex items-center justify-between mb-3 font-tech text-[10px] sm:text-[11px] tracking-wider">
                  <span class="text-primary-200/70">
                    PLOT · 12.97°N 77.59°E
                  </span>
                  <span class="flex items-center gap-1.5 text-secondary-300">
                    <span class="cmp-dot w-1.5 h-1.5 rounded-full bg-secondary-300" />
                    LIVE SCAN
                  </span>
                </div>

                {/* the NDVI grid */}
                <div class="relative rounded-xl overflow-hidden">
                  <div
                    class="grid gap-[3px] aspect-[8/5]"
                    style="grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(5,1fr)"
                    aria-hidden
                  >
                    {PLOT.flat().map((v, i) => (
                      <div
                        key={i}
                        class="rounded-[3px]"
                        style={`background:${ndviColor(v)}`}
                      />
                    ))}
                  </div>
                  {/* corner brackets */}
                  <span
                    class="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-white/60"
                    aria-hidden
                  />
                  <span
                    class="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-white/60"
                    aria-hidden
                  />
                  <span
                    class="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-white/60"
                    aria-hidden
                  />
                  <span
                    class="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-white/60"
                    aria-hidden
                  />
                  {/* detected stress zone marker */}
                  <div
                    class="cmp-ring absolute rounded-md border-2 border-secondary-300"
                    style="left:37.5%;top:40%;width:25%;height:40%"
                    aria-hidden
                  >
                    <span class="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-tech text-[9px] tracking-wide text-[#04240f] bg-secondary-300 px-1.5 py-0.5 rounded">
                      STRESS ↘
                    </span>
                  </div>
                  <div class="cmp-scan" aria-hidden />
                </div>

                {/* readouts */}
                <div class="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                  <Readout label="NDVI" value="0.71" note="↑ healthy" good />
                  <Readout label="SOIL MOIST." value="31%" note="adequate" />
                  <Readout label="RAIN · 5D" value="+12mm" note="expected" />
                </div>
                <figcaption class="mt-3 flex items-center gap-2 text-xs text-primary-100/70">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary-400" />
                  Verdict:{" "}
                  <span class="text-white font-medium">
                    Healthy · vegetative stage
                  </span>
                  <span class="ml-auto font-tech text-[10px] text-primary-200/50">
                    SENTINEL-2 · 5 JUL
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* spec strip */}
          <div class="relative border-t border-white/10 bg-black/20">
            <div class="max-w-6xl mx-auto px-5 py-4 flex flex-wrap justify-center sm:justify-between gap-x-8 gap-y-2 font-tech text-[11px] sm:text-xs tracking-wider text-primary-100/70">
              <Spec value="100+" label="CROPS SUPPORTED" />
              <Spec value="11" label="LANGUAGES" />
              <Spec value="~5-DAY" label="SATELLITE REFRESH" />
              <Spec value="₹0" label="TO GET STARTED" />
            </div>
          </div>
        </header>

        {/* ── How it works ─────────────────────────────────── */}
        <section
          id="how"
          class="bg-earth-50 text-[#04240f] px-5 py-20 md:py-24"
        >
          <div class="max-w-6xl mx-auto">
            <p class="font-tech text-xs tracking-[0.22em] text-earth-600 mb-3">
              HOW IT WORKS
            </p>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl tracking-tight max-w-xl leading-[1.08]">
              From orbit to your phone, in four steps.
            </h2>

            <ol class="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-8">
              <Step
                n="01"
                title="Capture"
                source="SENTINEL-2 · LANDSAT"
                body="Satellites scan your plot every ~5 days. We read NDVI to see crop vigour, field by field."
              />
              <Step
                n="02"
                title="Ground-truth"
                source="SOILGRIDS · OPEN-METEO"
                body="Soil, weather, and groundwater data fill in what the camera alone can't see."
              />
              <Step
                n="03"
                title="Reason"
                source="RULE ENGINE · NO BLACK BOX"
                body="A transparent scoring engine weighs the readings — every alert cites the numbers behind it."
              />
              <Step
                n="04"
                title="Advise"
                source="VOICE · 11 LANGUAGES"
                body="You get one clear action — when to irrigate, spray, or sell — read aloud in your language."
              />
            </ol>
          </div>
        </section>

        {/* ── What you get ─────────────────────────────────── */}
        <section class="bg-white text-[#04240f] px-5 py-20 md:py-24">
          <div class="max-w-6xl mx-auto">
            <p class="font-tech text-xs tracking-[0.22em] text-primary-600 mb-3">
              WHAT YOU GET
            </p>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl tracking-tight max-w-2xl leading-[1.08]">
              Everything your farm needs, in one place.
            </h2>

            <div class="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <Feature
                icon="satellite"
                tag="NDVI · SENTINEL-2"
                title="Crop health from space"
                body="Track vigour and spot stress, disease, or waterlogging before it spreads across the field."
              />
              <Feature
                icon="weather"
                tag="OPEN-METEO"
                title="Weather & irrigation"
                body="Rainfall forecasts and heat alerts tell you exactly when to water — and when to hold off."
              />
              <Feature
                icon="pest"
                tag="EARLY WARNING"
                title="Pest & disease alerts"
                body="Outbreak warnings tuned to your crop stage and local weather, before damage sets in."
              />
              <Feature
                icon="scan"
                tag="AI PHOTO SCAN"
                title="Snap & diagnose"
                body="Photograph a sick leaf and get a likely cause with a practical, low-cost remedy."
              />
              <Feature
                icon="market"
                tag="LIVE MANDI"
                title="Market prices"
                body="Real-time mandi rates and sell-or-hold guidance so your harvest earns what it should."
              />
              <Feature
                icon="schemes"
                tag="ELIGIBILITY"
                title="Government schemes"
                body="Find subsidies, insurance, and credit you qualify for — with step-by-step how-to-apply."
              />
            </div>
          </div>
        </section>

        {/* ── Language strip ───────────────────────────────── */}
        <section class="cmp-topo relative px-5 py-20 md:py-24">
          <div class="absolute inset-0 cmp-grid-lines opacity-30" aria-hidden />
          <div class="relative max-w-6xl mx-auto text-center">
            <p class="font-tech text-xs tracking-[0.22em] text-secondary-300 mb-3">
              SPOKEN IN 11 LANGUAGES
            </p>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl tracking-tight leading-[1.08]">
              Advice that speaks{" "}
              <span class="text-primary-300 italic">your language.</span>
            </h2>
            <p class="mt-4 text-primary-100/75 max-w-lg mx-auto">
              Every alert can be read aloud — no typing and no English required.
            </p>
          </div>
          {/* marquee of native language names */}
          <div class="relative mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
            <div class="cmp-marquee flex gap-3 w-max">
              {[...SUPPORTED_LANGUAGES, ...SUPPORTED_LANGUAGES].map((l, i) => (
                <span
                  key={i}
                  class="shrink-0 rounded-full border border-primary-400/30 bg-white/[0.04] px-5 py-2.5 text-lg font-medium text-primary-50"
                >
                  {l.nativeName}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────── */}
        <section class="bg-[#04240f] px-5 py-20 md:py-28">
          <div class="max-w-2xl mx-auto text-center">
            <h2 class="font-display font-semibold text-3xl sm:text-5xl tracking-tight leading-[1.05]">
              Point {SITE_NAME} at your field.
            </h2>
            <p class="mt-5 text-primary-100/75 text-lg">
              Free to start. Built on public data only. Your farm data stays
              yours.
            </p>
            <a
              href="/login"
              class="cmp-link inline-block mt-9 bg-secondary-400 text-[#04240f] px-8 py-4 rounded-xl text-lg font-semibold hover:bg-secondary-300 shadow-xl shadow-secondary-500/20 transition-colors"
            >
              Create your free account
            </a>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────── */}
        <footer class="bg-[#04240f] border-t border-white/10 px-5 py-10">
          <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-2 text-primary-100/70">
              <svg
                class="w-5 h-5 text-primary-300"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span class="font-semibold text-white">{SITE_NAME}</span>
              <span class="text-sm">
                &copy; {new Date().getFullYear()}
              </span>
            </div>
            <p class="font-tech text-[11px] tracking-wide text-primary-200/50 text-center sm:text-right">
              DATA: ESA COPERNICUS · NASA · ISRO BHUVAN · SOILGRIDS · OPEN-METEO
            </p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}

/* ── Small building blocks ───────────────────────────────── */

function Readout(
  { label, value, note, good }: {
    label: string;
    value: string;
    note: string;
    good?: boolean;
  },
) {
  return (
    <div class="rounded-lg bg-black/25 border border-white/10 px-2.5 py-2">
      <div class="font-tech text-[9px] tracking-wider text-primary-200/60">
        {label}
      </div>
      <div class="font-tech text-base sm:text-lg font-bold text-white leading-tight">
        {value}
      </div>
      <div
        class={`text-[10px] ${
          good ? "text-primary-300" : "text-primary-100/60"
        }`}
      >
        {note}
      </div>
    </div>
  );
}

function Spec({ value, label }: { value: string; label: string }) {
  return (
    <span class="flex items-baseline gap-2">
      <span class="text-white font-bold">{value}</span>
      <span class="text-primary-200/60">{label}</span>
    </span>
  );
}

function Step(
  { n, title, source, body }: {
    n: string;
    title: string;
    source: string;
    body: string;
  },
) {
  return (
    <li class="relative">
      <div class="font-tech text-sm text-earth-500 mb-3">{n}</div>
      <div class="h-px w-full bg-earth-200 mb-4" />
      <h3 class="font-display text-xl font-semibold mb-2">{title}</h3>
      <p class="text-sm text-earth-900/70 leading-relaxed mb-3">{body}</p>
      <span class="font-tech text-[10px] tracking-wider text-earth-500">
        {source}
      </span>
    </li>
  );
}

function Feature(
  { icon, tag, title, body }: {
    icon: string;
    tag: string;
    title: string;
    body: string;
  },
) {
  const icons: Record<string, preact.JSX.Element> = {
    satellite: (
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    ),
    weather: (
      <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    ),
    pest: (
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
    scan: (
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M8 12h8" />
    ),
    market: <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
    schemes: (
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  };

  return (
    <div class="group rounded-2xl border border-gray-200/80 bg-earth-50/40 p-6 hover:border-primary-300 hover:shadow-lg hover:shadow-primary-600/5 transition-all">
      <div class="flex items-center justify-between mb-5">
        <span class="w-11 h-11 rounded-xl bg-primary-600 text-white grid place-items-center group-hover:bg-primary-700 transition-colors">
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            viewBox="0 0 24 24"
          >
            {icons[icon]}
          </svg>
        </span>
        <span class="font-tech text-[10px] tracking-wider text-primary-600/70">
          {tag}
        </span>
      </div>
      <h3 class="font-display text-lg font-semibold mb-2">{title}</h3>
      <p class="text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
