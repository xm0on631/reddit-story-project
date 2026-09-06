"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Download, Play, Check, Loader2 } from "lucide-react";
import { useAuth, API_URL } from "@/lib/useAuth";
import { VideoClip, ResolvedVideo } from "@/lib/video-types";

function formatSeconds(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function saveBlobResponse(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VideoPage() {
  const { authed, checkingAuth, authHeader } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checkingAuth && !authed) router.replace("/");
  }, [checkingAuth, authed, router]);

  const [activeTab, setActiveTab] = useState<"discover" | "quickadd">("discover");

  // --- Discover ---
  const [subreddit, setSubreddit] = useState("");
  const [sort, setSort] = useState<"top" | "hot" | "new">("top");
  const [timeRange, setTimeRange] = useState("week");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  async function fetchDiscover() {
    if (!subreddit.trim()) return;
    setLoadingDiscover(true);
    setDiscoverError("");
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ subreddit: subreddit.trim(), sort, limit: "30" });
      if (sort === "top") params.set("t", timeRange);
      const res = await fetch(`${API_URL}/api/video/discover?${params.toString()}`, {
        headers: authHeader(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Ошибка запроса");
      }
      const data = await res.json();
      setClips(data.clips);
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : "Не удалось загрузить ленту");
      setClips([]);
    } finally {
      setLoadingDiscover(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadClip(clip: VideoClip) {
    setDownloadingId(clip.id);
    setDiscoverError("");
    try {
      const res = await fetch(`${API_URL}/api/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ url: clip.permalink, title: clip.title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Не удалось скачать");
      }
      await saveBlobResponse(res, `${clip.title.slice(0, 60)}.mp4`);
    } catch (e) {
      setDiscoverError(
        `Не удалось скачать "${clip.title}": ${e instanceof Error ? e.message : "ошибка"}`
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadSelected() {
    const chosen = clips.filter((c) => selectedIds.has(c.id));
    if (chosen.length === 0) return;
    setBatchDownloading(true);
    setBatchProgress({ done: 0, total: chosen.length });
    for (let i = 0; i < chosen.length; i++) {
      await downloadClip(chosen[i]);
      setBatchProgress({ done: i + 1, total: chosen.length });
    }
    setBatchDownloading(false);
    setSelectedIds(new Set());
  }

  // --- Quick Add ---
  const [urlInput, setUrlInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolved, setResolved] = useState<ResolvedVideo | null>(null);
  const [downloadingQuick, setDownloadingQuick] = useState(false);

  async function resolveUrl() {
    if (!urlInput.trim()) return;
    setResolving(true);
    setResolveError("");
    setResolved(null);
    try {
      const res = await fetch(`${API_URL}/api/video/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Не удалось обработать ссылку");
      }
      const data = await res.json();
      setResolved(data);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Не удалось обработать ссылку");
    } finally {
      setResolving(false);
    }
  }

  async function downloadResolved() {
    if (!urlInput.trim()) return;
    setDownloadingQuick(true);
    setResolveError("");
    try {
      const res = await fetch(`${API_URL}/api/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ url: urlInput.trim(), title: resolved?.title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Не удалось скачать");
      }
      await saveBlobResponse(res, `${(resolved?.title || "clip").slice(0, 60)}.mp4`);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Не удалось скачать");
    } finally {
      setDownloadingQuick(false);
    }
  }

  if (checkingAuth || !authed) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-neutral-300">
      <div className="max-w-5xl mx-auto px-6 py-8 md:px-10 md:py-12">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-3xl font-semibold text-white tracking-tight">Video Clips</h1>
          <Link href="/select" className="text-xs text-neutral-600 hover:text-white transition-colors">
            ← Сменить режим
          </Link>
        </div>

        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1 w-fit mb-8">
          <button
            onClick={() => setActiveTab("discover")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "discover" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => setActiveTab("quickadd")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "quickadd" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Quick Add (по ссылке)
          </button>
        </div>

        {activeTab === "discover" && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="text"
                value={subreddit}
                onChange={(e) => setSubreddit(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchDiscover()}
                placeholder="Сабреддит, например: instantkarma"
                className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-800 text-neutral-200 placeholder-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-neutral-600"
              >
                <option value="top">Top</option>
                <option value="hot">Hot</option>
                <option value="new">New</option>
              </select>
              {sort === "top" && (
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-neutral-600"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                  <option value="all">All time</option>
                </select>
              )}
              <button
                onClick={fetchDiscover}
                disabled={!subreddit.trim() || loadingDiscover}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-30 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <Search size={16} /> {loadingDiscover ? "Loading..." : "Search"}
              </button>
            </div>

            {discoverError && (
              <p className="text-red-400 text-sm mb-4">{discoverError}</p>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={downloadSelected}
                  disabled={batchDownloading}
                  className="flex items-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  <Download size={16} />
                  {batchDownloading
                    ? `Скачивание ${batchProgress.done}/${batchProgress.total}...`
                    : `Скачать выбранные (${selectedIds.size})`}
                </button>
              </div>
            )}

            {!loadingDiscover && clips.length === 0 && !discoverError && (
              <p className="text-neutral-500">
                Введи название сабреддита и нажми Search, чтобы увидеть видео-посты.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clips.map((clip) => {
                const isSelected = selectedIds.has(clip.id);
                const isPreviewing = previewingId === clip.id;
                const isDownloadingThis = downloadingId === clip.id;
                return (
                  <div
                    key={clip.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-neutral-900">
                      {isPreviewing && clip.preview_url ? (
                        <video
                          src={clip.preview_url}
                          controls
                          autoPlay
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <button
                          onClick={() => setPreviewingId(clip.id)}
                          className="w-full h-full flex items-center justify-center"
                        >
                          {clip.thumbnail ? (
                            <img
                              src={clip.thumbnail}
                              alt=""
                              className="w-full h-full object-cover opacity-80"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-900" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play size={28} className="text-white" />
                          </span>
                          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {formatSeconds(clip.duration)}
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => toggleSelect(clip.id)}
                        className={`absolute top-2 left-2 w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-white border-white text-black"
                            : "bg-black/50 border-white/40 text-transparent hover:border-white"
                        }`}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                    <div className="p-3">
                      <p className="text-sm text-white line-clamp-2 mb-1">{clip.title}</p>
                      <p className="text-xs text-neutral-500 mb-3">
                        r/{clip.subreddit} · {clip.score} upvotes · {clip.num_comments} comments
                      </p>
                      <button
                        onClick={() => downloadClip(clip)}
                        disabled={isDownloadingThis}
                        className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-sm transition-colors"
                      >
                        {isDownloadingThis ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {isDownloadingThis ? "Скачивание..." : "Download"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "quickadd" && (
          <div className="max-w-xl">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resolveUrl()}
                placeholder="Вставь ссылку на видео (TikTok, X, YouTube...)"
                className="flex-1 bg-neutral-900 border border-neutral-800 text-neutral-200 placeholder-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
              />
              <button
                onClick={resolveUrl}
                disabled={!urlInput.trim() || resolving}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-30 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {resolving ? "Loading..." : "Preview"}
              </button>
            </div>

            {resolveError && <p className="text-red-400 text-sm mb-4">{resolveError}</p>}

            {resolved && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
                {resolved.thumbnail && (
                  <img
                    src={resolved.thumbnail}
                    alt=""
                    className="w-full rounded-lg mb-4 aspect-video object-cover bg-neutral-900"
                  />
                )}
                <p className="text-white font-medium mb-1">{resolved.title}</p>
                <p className="text-xs text-neutral-500 mb-4">
                  {resolved.extractor}
                  {resolved.uploader ? ` · ${resolved.uploader}` : ""}
                  {resolved.duration ? ` · ${formatSeconds(resolved.duration)}` : ""}
                </p>
                <button
                  onClick={downloadResolved}
                  disabled={downloadingQuick}
                  className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors"
                >
                  {downloadingQuick ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {downloadingQuick ? "Скачивание..." : "Download"}
                </button>
                <p className="text-[11px] text-neutral-600 mt-2">
                  Превью без видео-плеера: часть площадок не отдаёт ссылку, которую можно
                  проигрывать прямо в браузере до скачивания.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
