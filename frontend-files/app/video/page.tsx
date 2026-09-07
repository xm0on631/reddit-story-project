"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Play, Check, Loader2, ExternalLink } from "lucide-react";
import { useAuth, API_URL } from "@/lib/useAuth";
import { VideoClip, ResolvedVideo } from "@/lib/video-types";

function formatSeconds(sec: number): string {
  if (!sec) return "";
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

function downloadTargetUrl(clip: VideoClip): string {
  // Reddit-hosted video needs the thread permalink (yt-dlp's Reddit
  // extractor merges the separate audio/video DASH streams from there).
  // An off-site link (YouTube/TikTok/etc in post.url) should be fed
  // directly to yt-dlp instead.
  return clip.is_video || clip.domain === "v.redd.it" ? clip.permalink : clip.url;
}

export default function VideoPage() {
  const { authed, checkingAuth, authHeader } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checkingAuth && !authed) router.replace("/");
  }, [checkingAuth, authed, router]);

  const [activeTab, setActiveTab] = useState<"catalog" | "quickadd">("catalog");

  // --- Catalog (local dump, same pattern as Stories) ---
  const [postsFile, setPostsFile] = useState<File | null>(null);
  const [minScore, setMinScore] = useState(1000);
  const [subredditFilter, setSubredditFilter] = useState("");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [loadingParse, setLoadingParse] = useState(false);
  const [parseError, setParseError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  async function handleParseDump() {
    if (!postsFile) return;
    setLoadingParse(true);
    setParseError("");
    setSelectedIds(new Set());
    const form = new FormData();
    form.append("posts", postsFile);
    form.append("min_score", String(minScore));
    form.append("subreddit", subredditFilter);
    try {
      const res = await fetch(`${API_URL}/api/video/parse-dump`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Ошибка запроса");
      }
      const data = await res.json();
      setClips(data.clips);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Не удалось обработать дамп");
      setClips([]);
    } finally {
      setLoadingParse(false);
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
    setParseError("");
    try {
      const res = await fetch(`${API_URL}/api/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          url: downloadTargetUrl(clip),
          title: clip.title,
          post_id: clip.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Не удалось скачать");
      }
      await saveBlobResponse(res, `${clip.title.slice(0, 60)}.mp4`);
    } catch (e) {
      setParseError(
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

  // --- Quick Add (paste any link - unaffected by the Reddit-API situation) ---
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
            onClick={() => setActiveTab("catalog")}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === "catalog" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Каталог из дампа
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

        {activeTab === "catalog" && (
          <div>
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Дамп постов (.jsonl / .zst)</label>
                <input
                  type="file"
                  accept=".jsonl,.zst"
                  onChange={(e) => setPostsFile(e.target.files?.[0] || null)}
                  className="text-sm text-neutral-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-neutral-800 file:bg-neutral-900 file:text-neutral-300 file:text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Min Score</label>
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-28 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-neutral-600"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Subreddit (опц.)</label>
                <input
                  type="text"
                  value={subredditFilter}
                  onChange={(e) => setSubredditFilter(e.target.value)}
                  placeholder="instantkarma"
                  className="w-40 bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-neutral-600"
                />
              </div>
              <button
                onClick={handleParseDump}
                disabled={!postsFile || loadingParse}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-30 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {loadingParse ? "Loading..." : "Load and Filter"}
              </button>
            </div>

            {parseError && <p className="text-red-400 text-sm mb-4">{parseError}</p>}

            {clips.length > 0 && (
              <p className="text-xs text-neutral-500 mb-4">Найдено видео-постов: {clips.length}</p>
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

            {!loadingParse && clips.length === 0 && !parseError && (
              <p className="text-neutral-500">
                Загрузи .jsonl или .zst дамп постов (Arctic Shift / Pushshift), укажи минимальный
                score — и получишь каталог видео-постов из него.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clips.map((clip) => {
                const isSelected = selectedIds.has(clip.id);
                const isPreviewing = previewingId === clip.id;
                const isDownloadingThis = downloadingId === clip.id;
                const hasPlayablePreview = Boolean(clip.preview_url);
                return (
                  <div
                    key={clip.id}
                    className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-neutral-900">
                      {isPreviewing && hasPlayablePreview ? (
                        <video
                          src={clip.preview_url}
                          controls
                          autoPlay
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <button
                          onClick={() =>
                            hasPlayablePreview
                              ? setPreviewingId(clip.id)
                              : window.open(clip.permalink || clip.url, "_blank")
                          }
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
                            {hasPlayablePreview ? (
                              <Play size={28} className="text-white" />
                            ) : (
                              <ExternalLink size={22} className="text-white" />
                            )}
                          </span>
                          {clip.duration > 0 && (
                            <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                              {formatSeconds(clip.duration)}
                            </span>
                          )}
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
                        r/{clip.subreddit} · {clip.score} upvotes · {clip.num_comments} comments ·{" "}
                        {clip.date}
                      </p>
                      <div className="flex gap-2">
                        <a
                          href={clip.permalink || clip.url}
                          target="_blank"
                          className="flex-1 flex items-center justify-center gap-1.5 border border-neutral-800 hover:bg-white/5 text-neutral-300 rounded-lg py-1.5 text-xs transition-colors"
                        >
                          <ExternalLink size={12} /> Thread
                        </a>
                        <button
                          onClick={() => downloadClip(clip)}
                          disabled={isDownloadingThis}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-white/10 border border-neutral-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs transition-colors"
                        >
                          {isDownloadingThis ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          {isDownloadingThis ? "..." : "Download"}
                        </button>
                      </div>
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
