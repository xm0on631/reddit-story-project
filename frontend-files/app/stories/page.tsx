"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Eye,
  Check,
  Trash2,
  Download,
  Settings as SettingsIcon,
  Undo2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Story, Comment, AppSettings, UndoAction, SortMode } from "@/lib/types";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  FILTERS_KEY,
  ACCENTS,
  FONT_SIZE_CLASS,
  loadJSON,
  estimateDuration,
} from "@/lib/settings";
import { CollapsibleText } from "@/components/CollapsibleText";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth, API_URL } from "@/lib/useAuth";

export default function StoriesPage() {
  const { authed, checkingAuth, authHeader } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checkingAuth && !authed) router.replace("/");
  }, [checkingAuth, authed, router]);

  // --- settings ---
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadJSON(SETTINGS_KEY, DEFAULT_SETTINGS)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);
  function showToast(message: string, type: "error" | "info" = "info") {
    setToast({ message, type });
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // --- mode ---
  const [mode, setMode] = useState<"default" | "feed">("default");

  // --- filters / upload panel (defaults persisted across visits) ---
  const savedFilters = loadJSON(FILTERS_KEY, { minWords: 1, maxWords: 1000, minScore: 1 });
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [postsFile, setPostsFile] = useState<File | null>(null);
  const [commentsFile, setCommentsFile] = useState<File | null>(null);
  const [minWords, setMinWords] = useState(savedFilters.minWords);
  const [maxWords, setMaxWords] = useState(savedFilters.maxWords);
  const [minScore, setMinScore] = useState(savedFilters.minScore);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [filePickerKey, setFilePickerKey] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ minWords, maxWords, minScore }));
  }, [minWords, maxWords, minScore]);

  // --- story queue (Default Mode) ---
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // --- feed mode ---
  const [feedSearch, setFeedSearch] = useState("");
  const [feedSort, setFeedSort] = useState<SortMode>("newest");
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [randomOrderIds, setRandomOrderIds] = useState<string[]>([]);
  const [commentMinWords, setCommentMinWords] = useState(1);
  const [commentMaxWords, setCommentMaxWords] = useState(1000);
  const [commentMinScore, setCommentMinScore] = useState(1);

  // --- cart ---
  const [cart, setCart] = useState<Story[]>([]);
  const [cartOpen, setCartOpen] = useState(true);

  // --- editing (live: textarea writes straight into the source array) ---
  const [editMode, setEditMode] = useState(false);
  const [reviewingCartId, setReviewingCartId] = useState<string | null>(null);

  // --- undo ---
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const queueStory = stories[currentIndex];
  const cartStory = reviewingCartId
    ? cart.find((c) => c.id === reviewingCartId) || null
    : null;
  const currentStory = cartStory || queueStory;

  function clearDump() {
    setStories([]);
    setCurrentIndex(0);
    setPostsFile(null);
    setCommentsFile(null);
    setReviewingCartId(null);
    setEditMode(false);
    setUndoStack([]);
    setExpandedPostId(null);
    setFilePickerKey((k) => k + 1);
  }

  async function handleUpload() {
    if (!postsFile) return;
    setLoading(true);
    const form = new FormData();
    form.append("posts", postsFile);
    if (commentsFile) form.append("comments", commentsFile);
    form.append("min_words", String(minWords));
    form.append("max_words", String(maxWords));
    form.append("min_score", String(minScore));
    form.append("keyword", keyword);

    try {
      const res = await fetch(`${API_URL}/api/parse`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      const data = await res.json();
      setStories(data.stories);
      setCurrentIndex(0);
      setReviewingCartId(null);
      setEditMode(false);
      setUndoStack([]);
      setExpandedPostId(null);
    } catch (e) {
      showToast("Не удалось связаться с бэкендом. Проверь, что он запущен и API_URL верный.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function markPost(post_id: string, status: "approved" | "skipped") {
    try {
      await fetch(`${API_URL}/api/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ post_id, status }),
      });
    } catch {
      // Non-fatal: story still moves on locally even if the mark request fails.
    }
  }

  async function unmarkPost(post_id: string) {
    try {
      await fetch(`${API_URL}/api/mark/${encodeURIComponent(post_id)}`, {
        method: "DELETE",
        headers: authHeader(),
      });
    } catch {
      // Non-fatal.
    }
  }

  function approve() {
    if (!queueStory) return;
    const approvedStory: Story = {
      ...queueStory,
      type: queueStory.type || "post",
      approvedBy: settings.displayName || undefined,
    };
    setCart((c) => [...c, approvedStory]);
    markPost(queueStory.id, "approved");
    setUndoStack((u) => [...u, { type: "approved", story: queueStory, index: currentIndex }]);
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
  }

  function skip() {
    if (!queueStory) return;
    if (settings.confirmSkip && typeof window !== "undefined") {
      if (!window.confirm("Скипнуть эту историю?")) return;
    }
    markPost(queueStory.id, "skipped");
    setUndoStack((u) => [...u, { type: "skipped", story: queueStory, index: currentIndex }]);
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
  }

  function performUndo() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    if (last.type === "approved") {
      setCart((c) => {
        const idx = [...c].reverse().findIndex((s) => s.id === last.story.id);
        if (idx === -1) return c;
        const realIdx = c.length - 1 - idx;
        return c.filter((_, i) => i !== realIdx);
      });
    }
    unmarkPost(last.story.id);
    setCurrentIndex(last.index);
    setReviewingCartId(null);
    setEditMode(false);
    showToast(`Отменено: ${last.story.title}`, "info");
  }

  function removeFromCart(id: string) {
    setCart((c) => c.filter((s) => s.id !== id));
    if (reviewingCartId === id) {
      setReviewingCartId(null);
      setEditMode(false);
    }
  }

  function openCartItem(id: string) {
    setReviewingCartId(id);
    setEditMode(true);
  }

  function approveComment(post: Story, comment: Comment) {
    if (cart.some((c) => c.id === comment.id)) return;
    const approvedComment: Story = {
      id: comment.id,
      title: `Comment on: ${post.title}`,
      text: comment.text,
      words: comment.words,
      score: comment.score,
      date: comment.date,
      url: post.url,
      type: "comment",
      parentTitle: post.title,
      author: comment.author,
      approvedBy: settings.displayName || undefined,
    };
    setCart((c) => [...c, approvedComment]);
    markPost(comment.id, "approved");
  }

  function downloadCart(format: "txt" | "json" = "txt") {
    if (format === "json") {
      const blob = new Blob([JSON.stringify(cart, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "approved_stories.json";
      a.click();
      URL.revokeObjectURL(url);
      setCart([]);
      return;
    }
    let out = "";
    for (const s of cart) {
      if (s.type === "comment") {
        out += `Type: Comment\nParent Post: ${s.parentTitle || ""}\n`;
      }
      out += `Title: ${s.title}\nWords: ${s.words} | Upvotes: ${s.score} | Date: ${s.date}\nURL: ${s.url}\n`;
      out += "-".repeat(50) + "\n" + s.text + "\n" + "=".repeat(50) + "\n\n";
    }
    const blob = new Blob([out], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "approved_stories.txt";
    a.click();
    URL.revokeObjectURL(url);
    setCart([]);
  }

  function shuffleFeed() {
    const ids = stories.map((s) => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setRandomOrderIds(ids);
  }

  function getDisplayedFeedPosts(): Story[] {
    let list = stories.filter((s) => {
      if (!feedSearch.trim()) return true;
      const q = feedSearch.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.text.toLowerCase().includes(q) ||
        (s.subreddit || "").toLowerCase().includes(q)
      );
    });
    if (feedSort === "oldest") return [...list].sort((a, b) => a.date.localeCompare(b.date));
    if (feedSort === "top") return [...list].sort((a, b) => b.score - a.score);
    if (feedSort === "comments")
      return [...list].sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    if (feedSort === "random") {
      const byId = new Map(list.map((s) => [s.id, s]));
      const ordered = randomOrderIds
        .map((id) => byId.get(id))
        .filter((s): s is Story => Boolean(s));
      const remaining = list.filter((s) => !randomOrderIds.includes(s.id));
      return [...ordered, ...remaining];
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }

  // --- keyboard shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!settings.hotkeysEnabled || settingsOpen) return;
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (editMode) setEditMode(false);
        return;
      }

      if (isTyping || !currentStory || mode !== "default") return;

      const key = e.key.toLowerCase();
      if (key === "a" && !cartStory) {
        e.preventDefault();
        approve();
      } else if (key === "s" && !cartStory) {
        e.preventDefault();
        skip();
      } else if (key === "e") {
        e.preventDefault();
        setEditMode((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (checkingAuth || !authed) {
    return <div className="min-h-screen bg-black" />;
  }

  const cardPadding = settings.density === "compact" ? "p-5" : "p-8";
  const fontSizeClass = FONT_SIZE_CLASS[settings.fontSize];
  const progressPct = stories.length > 0 ? Math.min(100, (currentIndex / stories.length) * 100) : 0;
  const cartTotalWords = cart.reduce((sum, s) => sum + (s.words || 0), 0);
  const displayedFeedPosts = mode === "feed" ? getDisplayedFeedPosts() : [];

  return (
    <div className="flex min-h-screen bg-black text-neutral-300">
      {/* TOAST */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === "error"
              ? "bg-red-950 border-red-800 text-red-200"
              : "bg-neutral-900 border-neutral-700 text-neutral-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSetting}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR — sticky, own scroll */}
      <div className="flex flex-col w-72 bg-neutral-950 border-r border-neutral-800 shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <span className="text-sm font-semibold text-white">Reddit Story Tool</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <SettingsIcon size={18} />
          </button>
        </div>

        {/* Filters / upload — collapsible */}
        <div className="border-b border-neutral-800">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900 transition-colors"
          >
            <span className="uppercase tracking-wide text-xs text-neutral-500">Dump &amp; Filters</span>
            {filtersOpen ? (
              <ChevronDown size={16} className="text-neutral-600" />
            ) : (
              <ChevronRight size={16} className="text-neutral-600" />
            )}
          </button>
          {filtersOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <input
                  key={`posts-${filePickerKey}`}
                  type="file"
                  accept=".jsonl"
                  onChange={(e) => setPostsFile(e.target.files?.[0] || null)}
                  className="text-sm text-neutral-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-neutral-800 file:bg-neutral-900 file:text-neutral-300 file:text-xs"
                />
                <p className="text-[10px] text-neutral-600 mt-1">Posts dump (.jsonl)</p>
              </div>
              <div>
                <input
                  key={`comments-${filePickerKey}`}
                  type="file"
                  accept=".jsonl"
                  onChange={(e) => setCommentsFile(e.target.files?.[0] || null)}
                  className="text-sm text-neutral-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-neutral-800 file:bg-neutral-900 file:text-neutral-300 file:text-xs"
                />
                <p className="text-[10px] text-neutral-600 mt-1">Comments dump (.jsonl, optional)</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-neutral-500">Min Words</label>
                  <input
                    type="number"
                    value={minWords}
                    onChange={(e) => setMinWords(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:border-neutral-600"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500">Max Words</label>
                  <input
                    type="number"
                    value={maxWords}
                    onChange={(e) => setMaxWords(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:border-neutral-600"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500">Min Upvotes</label>
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:border-neutral-600"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Contains Word (optional)</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:border-neutral-600"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={!postsFile || loading}
                className={`w-full border text-white rounded-lg py-2 font-medium transition-colors disabled:opacity-30 ${ACCENTS[settings.accent].button}`}
              >
                {loading ? "Loading..." : "Load and Shuffle"}
              </button>
              {(postsFile || commentsFile || stories.length > 0) && (
                <button
                  onClick={clearDump}
                  className="w-full text-xs text-neutral-500 hover:text-red-400 transition-colors"
                >
                  Clear dump
                </button>
              )}
              {stories.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">
                    {Math.min(currentIndex, stories.length)} / {stories.length} reviewed
                  </p>
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ACCENTS[settings.accent].solid} transition-all`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart — collapsible, pinned toward bottom */}
        <div className="mt-auto border-t border-neutral-800">
          <button
            onClick={() => setCartOpen((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900 transition-colors"
          >
            <span className="uppercase tracking-wide text-xs text-neutral-500">Cart ({cart.length})</span>
            {cartOpen ? (
              <ChevronDown size={16} className="text-neutral-600" />
            ) : (
              <ChevronRight size={16} className="text-neutral-600" />
            )}
          </button>
          {cartOpen && (
            <div className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
              {cart.length === 0 && (
                <p className="text-xs text-neutral-600">Ничего не одобрено пока.</p>
              )}
              {cart.length > 0 && (
                <p className="text-xs text-neutral-500">
                  Total: {estimateDuration(cartTotalWords, settings.wpm)} ({cartTotalWords} words)
                </p>
              )}
              {cart.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-sm"
                >
                  <button
                    onClick={() => openCartItem(s.id)}
                    className="truncate text-left text-neutral-300 hover:text-white flex-1 transition-colors"
                    title={s.title}
                  >
                    {s.type === "comment" && <span className="text-neutral-600">↳ </span>}
                    {s.title}
                    {s.approvedBy && (
                      <span className="text-[10px] text-neutral-600 ml-1">· {s.approvedBy}</span>
                    )}
                  </button>
                  <button
                    onClick={() => removeFromCart(s.id)}
                    className="text-neutral-600 hover:text-red-400 shrink-0 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {cart.length > 0 && (
                <div className="space-y-2 mt-2">
                  <button
                    onClick={() => downloadCart("txt")}
                    className={`w-full flex items-center justify-center gap-2 border text-white rounded-lg py-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
                  >
                    <Download size={16} /> DOWNLOAD .TXT
                  </button>
                  <button
                    onClick={() => downloadCart("json")}
                    className="w-full flex items-center justify-center gap-2 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg py-1.5 text-xs transition-colors"
                  >
                    <Download size={14} /> Download .json
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="flex-1 px-6 py-8 md:px-10 md:py-12 max-w-4xl mx-auto w-full leading-relaxed">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-white tracking-tight">Reddit Story Tool</h1>
            <Link href="/select" className="text-xs text-neutral-600 hover:text-white transition-colors">
              ← Сменить режим
            </Link>
          </div>
          <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setMode("default")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                mode === "default" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Default Mode
            </button>
            <button
              onClick={() => setMode("feed")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                mode === "feed" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Reddit Feed Mode
            </button>
          </div>
        </div>

        {mode === "default" && (
          <>
            {undoStack.length > 0 && (
              <button
                onClick={performUndo}
                className="mb-6 inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
              >
                <Undo2 size={14} />
                Undo last (
                {undoStack[undoStack.length - 1].type === "approved" ? "approve" : "skip"}:{" "}
                {undoStack[undoStack.length - 1].story.title})
              </button>
            )}

            {!currentStory && (
              <p className="text-neutral-500">
                Загрузи дамп слева и нажми "Load and Shuffle", чтобы начать.
              </p>
            )}

            {currentStory && (
              <div className={`bg-neutral-950 border border-neutral-800 rounded-xl ${cardPadding}`}>
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h2 className="text-2xl font-semibold text-white tracking-tight">{currentStory.title}</h2>
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    className="text-sm shrink-0 text-neutral-500 hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    {editMode ? (
                      <>
                        <Eye size={14} /> View
                      </>
                    ) : (
                      <>
                        <Edit3 size={14} /> Edit
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mb-6">
                  Words: {currentStory.words} ({estimateDuration(currentStory.words, settings.wpm)}) |
                  Upvotes: {currentStory.score} | Date: {currentStory.date}
                  {currentStory.url && (
                    <>
                      {" · "}
                      <a
                        href={currentStory.url}
                        target="_blank"
                        className="underline hover:text-neutral-300"
                      >
                        Post Link
                      </a>
                    </>
                  )}
                </p>

                {editMode ? (
                  <textarea
                    value={currentStory.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (cartStory) {
                        setCart((c) => c.map((s) => (s.id === cartStory.id ? { ...s, text: val } : s)));
                      } else if (queueStory) {
                        setStories((s) =>
                          s.map((story, i) => (i === currentIndex ? { ...story, text: val } : story))
                        );
                      }
                    }}
                    rows={14}
                    className={`w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg p-4 leading-relaxed focus:outline-none focus:border-neutral-600 ${fontSizeClass}`}
                  />
                ) : (
                  <CollapsibleText
                    key={currentStory.id}
                    text={currentStory.text}
                    keyword={keyword}
                    defaultExpanded={settings.defaultTextExpanded}
                    fontSizeClass={fontSizeClass}
                  />
                )}

                <div className="flex gap-3 mt-6">
                  {cartStory ? (
                    <button
                      onClick={() => {
                        setReviewingCartId(null);
                        setEditMode(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 border text-white rounded-lg py-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
                    >
                      <Check size={16} /> Done
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={approve}
                        className={`flex-1 border text-white rounded-lg py-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={skip}
                        className="flex-1 bg-transparent border border-neutral-800 hover:bg-white/5 text-neutral-300 rounded-lg py-2 font-medium transition-colors"
                      >
                        SKIP
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {mode === "feed" && (
          <div>
            {stories.length === 0 ? (
              <p className="text-neutral-500">Загрузи дамп слева, чтобы увидеть ленту.</p>
            ) : (
              <>
                {stories[0]?.subreddit && (
                  <h2 className="text-lg font-semibold text-white mb-4">r/{stories[0].subreddit}</h2>
                )}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={feedSearch}
                    onChange={(e) => setFeedSearch(e.target.value)}
                    placeholder="Search title, text, subreddit..."
                    className="flex-1 bg-neutral-900 border border-neutral-800 text-neutral-200 placeholder-neutral-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-neutral-600"
                  />
                  <select
                    value={feedSort}
                    onChange={(e) => {
                      const val = e.target.value as SortMode;
                      if (val === "random") shuffleFeed();
                      setFeedSort(val);
                    }}
                    className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-neutral-600"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="top">Most Upvoted</option>
                    <option value="comments">Most Comments</option>
                    <option value="random">Random</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {displayedFeedPosts.map((post) => {
                    const isExpanded = expandedPostId === post.id;
                    const postComments = post.comments || [];
                    const filteredComments = isExpanded
                      ? postComments.filter(
                          (c) =>
                            c.words >= commentMinWords &&
                            c.words <= commentMaxWords &&
                            c.score >= commentMinScore
                        )
                      : [];
                    return (
                      <div
                        key={post.id}
                        className="bg-neutral-950 border border-neutral-800 rounded-xl p-5"
                      >
                        <button
                          onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                          className="w-full text-left"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <h3 className="text-base font-semibold text-white">{post.title}</h3>
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-neutral-600 shrink-0 mt-1" />
                            ) : (
                              <ChevronRight size={16} className="text-neutral-600 shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-1">
                            {post.author ? `u/${post.author} · ` : ""}
                            Upvotes: {post.score} | Comments: {postComments.length} | Date: {post.date}
                            {post.url && (
                              <>
                                {" · "}
                                <a
                                  href={post.url}
                                  target="_blank"
                                  className="underline hover:text-neutral-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Post Link
                                </a>
                              </>
                            )}
                          </p>
                        </button>

                        {isExpanded && (
                          <div className="mt-4">
                            <CollapsibleText
                              key={post.id}
                              text={post.text}
                              keyword={feedSearch}
                              defaultExpanded={settings.defaultTextExpanded}
                              fontSizeClass={fontSizeClass}
                            />

                            <div className="mt-5 pt-4 border-t border-neutral-800">
                              <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                                Comments ({filteredComments.length}/{postComments.length})
                              </p>
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="number"
                                  value={commentMinWords}
                                  onChange={(e) => setCommentMinWords(Number(e.target.value))}
                                  placeholder="Min words"
                                  className="w-24 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-neutral-600"
                                />
                                <input
                                  type="number"
                                  value={commentMaxWords}
                                  onChange={(e) => setCommentMaxWords(Number(e.target.value))}
                                  placeholder="Max words"
                                  className="w-24 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-neutral-600"
                                />
                                <input
                                  type="number"
                                  value={commentMinScore}
                                  onChange={(e) => setCommentMinScore(Number(e.target.value))}
                                  placeholder="Min upvotes"
                                  className="w-28 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-neutral-600"
                                />
                              </div>

                              <div className="space-y-2">
                                {filteredComments.length === 0 && (
                                  <p className="text-xs text-neutral-600">
                                    Нет комментариев под текущие фильтры.
                                  </p>
                                )}
                                {filteredComments.map((c) => {
                                  const inCart = cart.some((cc) => cc.id === c.id);
                                  return (
                                    <div
                                      key={c.id}
                                      className="bg-neutral-900 border border-neutral-800 rounded-lg p-3"
                                    >
                                      <p className="text-xs text-neutral-500 mb-1">
                                        {c.author ? `u/${c.author} · ` : ""}
                                        {c.words} words ({estimateDuration(c.words, settings.wpm)}) ·{" "}
                                        {c.score} upvotes
                                      </p>
                                      <CollapsibleText
                                        key={c.id}
                                        text={c.text}
                                        defaultExpanded={settings.defaultTextExpanded}
                                        fontSizeClass="text-sm"
                                      />
                                      <button
                                        onClick={() => approveComment(post, c)}
                                        disabled={inCart}
                                        className={`mt-2 text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-40 ${ACCENTS[settings.accent].button}`}
                                      >
                                        {inCart ? "In cart" : "APPROVE"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
