import { Head } from "$fresh/runtime.ts";
import { SITE_NAME } from "$utils/constants.ts";
import VideoReels from "$islands/VideoReels.tsx";

export default function ReelsPage() {
  return (
    <>
      <Head>
        <title>Reels | {SITE_NAME}</title>
        <meta name="theme-color" content="#000000" />
        <style>
          {`
            .reels-page { height: 100dvh; display: flex; flex-direction: column; background: #000; }
            .reels-header { flex-shrink: 0; }
            .reels-content { flex: 1; min-height: 0; overflow: hidden; }
            .reels-nav { flex-shrink: 0; }
          `}
        </style>
      </Head>
      <div class="reels-page">
        {/* Header */}
        <header class="reels-header bg-black/90 backdrop-blur-sm text-white px-4 py-3 z-50 border-b border-white/10">
          <div class="flex items-center justify-between max-w-lg mx-auto">
            <div class="flex items-center gap-3">
              <a
                href="/app"
                class="p-1 -ml-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </a>
              <h1 class="text-lg font-semibold">Reels</h1>
            </div>
          </div>
        </header>

        {/* Fullscreen reels content */}
        <div class="reels-content">
          <VideoReels />
        </div>

        {/* Bottom Navigation */}
        <nav class="reels-nav bg-black/90 backdrop-blur-sm border-t border-white/10 px-4 py-2 z-50">
          <div class="max-w-lg mx-auto flex justify-around">
            <a
              href="/app"
              class="flex flex-col items-center py-1 px-3 text-gray-400 hover:text-white"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              <span class="text-xs mt-1">Home</span>
            </a>
            <a
              href="/app/reels"
              class="flex flex-col items-center py-1 px-3 text-white"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span class="text-xs mt-1">Reels</span>
            </a>
            <a
              href="/app/farm"
              class="flex flex-col items-center py-1 px-3 text-gray-400 hover:text-white"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              <span class="text-xs mt-1">My Farm</span>
            </a>
            <a
              href="/app/market"
              class="flex flex-col items-center py-1 px-3 text-gray-400 hover:text-white"
            >
              <svg
                class="w-6 h-6"
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
              <span class="text-xs mt-1">Market</span>
            </a>
            <a
              href="/app/profile"
              class="flex flex-col items-center py-1 px-3 text-gray-400 hover:text-white"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span class="text-xs mt-1">Profile</span>
            </a>
          </div>
        </nav>
      </div>
    </>
  );
}
