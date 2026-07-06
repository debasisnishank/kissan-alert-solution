import { useCallback, useEffect, useRef, useState } from "preact/hooks";

interface Video {
  id: string;
  platform: string;
  title: string;
  description: string;
  channelName: string;
  thumbnailUrl: string;
  videoUrl: string;
  embedUrl: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  isShort: boolean;
  category: string;
  publishedAt: string;
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 365) return `${Math.floor(days / 365)}y ago`;
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  return "Today";
}

type FetchStatus = "idle" | "fetching" | "done" | "error";

export default function VideoReels() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchProgress, setFetchProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasFetchedOnce = useRef(false);
  const loadingMore = useRef(false);

  const fetchVideos = async (pageNum: number, reset = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reels?page=${pageNum}&limit=10`);
      const data = await res.json();
      const newVideos = data.data || [];
      if (reset) {
        setVideos(newVideos);
      } else {
        setVideos((prev) => [...prev, ...newVideos]);
      }
      setHasMore(newVideos.length >= 10);
      return newVideos.length;
    } catch {
      return 0;
    } finally {
      setLoading(false);
    }
  };

  const triggerFetch = async () => {
    setFetchStatus("fetching");
    setFetchProgress(0);
    const interval = setInterval(() => {
      setFetchProgress((p) => (p >= 90 ? p : p + Math.random() * 8));
    }, 600);
    try {
      const res = await fetch("/api/reels/fetch", { method: "POST" });
      await res.json();
      clearInterval(interval);
      if (!res.ok) {
        setFetchStatus("error");
        return;
      }
      setFetchProgress(100);
      setFetchStatus("done");
      await new Promise((r) => setTimeout(r, 500));
      setPage(1);
      setActiveIndex(0);
      await fetchVideos(1, true);
      setFetchStatus("idle");
    } catch {
      clearInterval(interval);
      setFetchStatus("error");
    }
  };

  useEffect(() => {
    setPage(1);
    setActiveIndex(0);
    hasFetchedOnce.current = false;
    fetchVideos(1, true).then((count) => {
      if (count === 0 && !hasFetchedOnce.current) {
        hasFetchedOnce.current = true;
        triggerFetch();
      }
    });
  }, []);

  // Snap scroll observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const height = container.clientHeight;
      const newIndex = Math.round(scrollTop / height);
      if (newIndex !== activeIndex) {
        setActiveIndex(newIndex);
        setExpanded(false);
      }
      // Load more when near end
      if (
        newIndex >= videos.length - 3 && hasMore && !loadingMore.current
      ) {
        loadingMore.current = true;
        const nextPage = page + 1;
        setPage(nextPage);
        fetchVideos(nextPage).then(() => {
          loadingMore.current = false;
        });
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeIndex, videos.length, hasMore, page]);

  const markViewed = useCallback(async (video: Video) => {
    try {
      await fetch("/api/reels/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          watchedSeconds: 0,
          completed: false,
        }),
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (videos[activeIndex]) markViewed(videos[activeIndex]);
  }, [activeIndex, videos]);

  const handleLike = async (videoId: string) => {
    const isLiked = liked.has(videoId);
    setLiked((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
    try {
      await fetch("/api/reels/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, liked: !isLiked }),
      });
    } catch {
      // ignore
    }
  };

  const handleShare = (video: Video) => {
    if (navigator.share) {
      navigator.share({
        title: video.title,
        url: video.videoUrl,
      });
    } else {
      navigator.clipboard.writeText(video.videoUrl);
    }
  };

  // Fetching state
  if (fetchStatus === "fetching" || fetchStatus === "done") {
    return (
      <div class="flex flex-col items-center justify-center h-full bg-black text-white">
        <svg
          class="w-16 h-16 text-primary-400 mb-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <h3 class="text-lg font-semibold mb-2">
          {fetchStatus === "done"
            ? "Videos ready!"
            : "Fetching agricultural videos..."}
        </h3>
        <p class="text-sm text-gray-400 mb-6">
          {fetchStatus === "done"
            ? "Loading your feed"
            : "Finding the best farming content"}
        </p>
        <div class="w-64 bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            class="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(fetchProgress, 100)}%` }}
          />
        </div>
        <p class="text-xs text-gray-500 mt-2">
          {Math.round(Math.min(fetchProgress, 100))}%
        </p>
      </div>
    );
  }

  if (fetchStatus === "error") {
    return (
      <div class="flex flex-col items-center justify-center h-full bg-black text-white">
        <svg
          class="w-16 h-16 text-red-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <h3 class="text-lg font-semibold mb-2">Could not fetch videos</h3>
        <p class="text-sm text-gray-400 mb-4">Check YouTube API key</p>
        <button
          type="button"
          onClick={() => triggerFetch()}
          class="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (loading && videos.length === 0) {
    return (
      <div class="flex items-center justify-center h-full bg-black">
        <div class="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center h-full bg-black text-white">
        <svg
          class="w-16 h-16 text-gray-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <p class="text-lg font-medium">No videos available</p>
        <button
          type="button"
          onClick={() => triggerFetch()}
          class="mt-4 px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          Fetch Videos
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      class="h-full overflow-y-scroll snap-y snap-mandatory"
      style={{
        scrollSnapType: "y mandatory",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {videos.map((video, index) => {
        const isActive = index === activeIndex;
        const isLiked = liked.has(video.id);

        return (
          <div
            key={video.id}
            class="h-full w-full snap-start snap-always relative bg-black flex items-center justify-center"
            style={{ scrollSnapAlign: "start" }}
          >
            {/* Video embed - only render for active and adjacent */}
            {Math.abs(index - activeIndex) <= 1
              ? (
                <iframe
                  src={`${video.embedUrl}?autoplay=${
                    isActive ? "1" : "0"
                  }&mute=0&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&loop=1`}
                  class="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ border: "none" }}
                />
              )
              : (
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover"
                />
              )}

            {/* Gradient overlays */}
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

            {/* Right side action buttons */}
            <div class="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
              {/* Like */}
              <button
                type="button"
                onClick={() => handleLike(video.id)}
                class="flex flex-col items-center"
              >
                <div
                  class={`w-11 h-11 rounded-full flex items-center justify-center ${
                    isLiked ? "bg-red-500" : "bg-white/20 backdrop-blur-sm"
                  }`}
                >
                  <svg
                    class="w-6 h-6 text-white"
                    fill={isLiked ? "currentColor" : "none"}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </div>
                <span class="text-white text-xs mt-1">
                  {video.likeCount > 0 ? formatViews(video.likeCount) : "Like"}
                </span>
              </button>

              {/* Share */}
              <button
                type="button"
                onClick={() => handleShare(video)}
                class="flex flex-col items-center"
              >
                <div class="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg
                    class="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                </div>
                <span class="text-white text-xs mt-1">Share</span>
              </button>

              {/* Open in YouTube */}
              <a
                href={video.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex flex-col items-center"
              >
                <div class="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg
                    class="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
                <span class="text-white text-xs mt-1">Open</span>
              </a>
            </div>

            {/* Bottom overlay: title, channel, description */}
            <div class="absolute bottom-4 left-3 right-16 z-10">
              {/* Channel */}
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg
                    class="w-4 h-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <span class="text-white text-sm font-semibold">
                  {video.channelName}
                </span>
                <span class="text-white/60 text-xs capitalize">
                  {video.platform}
                </span>
              </div>

              {/* Title */}
              <h3 class="text-white font-semibold text-base leading-snug mb-1">
                {video.title}
              </h3>

              {/* Description (expandable) */}
              {video.description && (
                <div>
                  <p
                    class={`text-white/80 text-xs leading-relaxed ${
                      expanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {video.description}
                  </p>
                  {video.description.length > 100 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(!expanded)}
                      class="text-white/60 text-xs font-medium mt-0.5"
                    >
                      {expanded ? "Less" : "More"}
                    </button>
                  )}
                </div>
              )}

              {/* Stats */}
              <div class="flex items-center gap-3 mt-2 text-white/50 text-xs">
                {video.viewCount > 0 && (
                  <span>{formatViews(video.viewCount)} views</span>
                )}
                <span>{timeAgo(video.publishedAt)}</span>
                {video.isShort && (
                  <span class="bg-red-500/80 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">
                    Short
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
