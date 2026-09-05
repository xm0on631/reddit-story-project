"use client";

import { useState, useEffect } from "react";
import {
  Edit3,
  Eye,
  Save,
  Trash2,
  Download,
  Settings as SettingsIcon,
  Undo2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

interface Story {
  id: string;
  title: string;
  text: string;
  words: number;
  score: number;
  date: string;
  url: string;
  approvedBy?: string;
}

interface AppSettings {
  accent: "neutral" | "blue" | "emerald" | "amber" | "rose";
  fontSize: "sm" | "base" | "lg";
  density: "comfortable" | "compact";
  wpm: number;
  hotkeysEnabled: boolean;
  confirmSkip: boolean;
  displayName: string;
}

interface UndoAction {
  type: "approved" | "skipped";
  story: Story;
  index: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  accent: "neutral",
  fontSize: "base",
  density: "comfortable",
  wpm: 150,
  hotkeysEnabled: true,
  confirmSkip: false,
  displayName: "",
};

const SETTINGS_KEY = "rst_settings";
const FILTERS_KEY = "rst_default_filters";

const ACCENTS: Record<
  AppSettings["accent"],
  { label: string; button: string; solid: string; ring: string }
> = {
  neutral: {
    label: "Neutral",
    button: "bg-neutral-800 hover:bg-white/10 border-neutral-700",
    solid: "bg-neutral-400",
    ring: "ring-neutral-400",
  },
  blue: {
    label: "Blue",
    button: "bg-blue-950 hover:bg-blue-900 border-blue-800",
    solid: "bg-blue-500",
    ring: "ring-blue-500",
  },
  emerald: {
    label: "Emerald",
    button: "bg-emerald-950 hover:bg-emerald-900 border-emerald-800",
    solid: "bg-emerald-500",
    ring: "ring-emerald-500",
  },
  amber: {
    label: "Amber",
    button: "bg-amber-950 hover:bg-amber-900 border-amber-800",
    solid: "bg-amber-500",
    ring: "ring-amber-500",
  },
  rose: {
    label: "Rose",
    button: "bg-rose-950 hover:bg-rose-900 border-rose-800",
    solid: "bg-rose-500",
    ring: "ring-rose-500",
  },
};

const FONT_SIZE_CLASS: Record<AppSettings["fontSize"], string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function estimateDuration(words: number, wpm: number): string {
  const safeWpm = wpm > 0 ? wpm : 150;
  const minutes = words / safeWpm;
  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * 60));
    return `~${seconds} sec`;
  }
  const rounded = Math.round(minutes * 2) / 2;
  return `~${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} min`;
}

function highlightText(text: string, keyword: string) {
  const kw = keyword.trim();
  if (!kw) return text;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase() ? (
      <mark key={i} className="bg-amber-500/20 text-amber-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${
        checked ? "bg-white/30" : "bg-neutral-800"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Point this at your backend. In Codespaces, forward port 8000 and paste that URL here.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  // --- shared password gate (no accounts, just one shared password) ---
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("app_password") : null;
    if (saved) {
      fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: saved }),
      })
        .then((res) => {
          if (res.ok) setAuthed(true);
          else localStorage.removeItem("app_password");
        })
        .finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
  });

  async function handleLogin() {
    setAuthError("");
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    });
    if (res.ok) {
      localStorage.setItem("app_password", passwordInput);
      setAuthed(true);
    } else {
      setAuthError("Неверный пароль");
    }
  }

  function authHeader() {
    return { "X-App-Password": localStorage.getItem("app_password") || "" };
  }

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

  // --- filters / upload panel (defaults persisted across visits) ---
  const savedFilters = loadJSON(FILTERS_KEY, { minWords: 1, maxWords: 1000, minScore: 1 });
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [minWords, setMinWords] = useState(savedFilters.minWords);
  const [maxWords, setMaxWords] = useState(savedFilters.maxWords);
  const [minScore, setMinScore] = useState(savedFilters.minScore);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ minWords, maxWords, minScore }));
  }, [minWords, maxWords, minScore]);

  // --- story queue ---
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // --- cart ---
  const [cart, setCart] = useState<Story[]>([]);
  const [cartOpen, setCartOpen] = useState(true);

  // --- editing ---
  const [editMode, setEditMode] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [reviewingCartId, setReviewingCartId] = useState<string | null>(null);

  // --- undo ---
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const queueStory = stories[currentIndex];
  const cartStory = reviewingCartId
    ? cart.find((c) => c.id === reviewingCartId) || null
    : null;
  const currentStory = cartStory || queueStory;

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
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
    const finalText = editMode && draftText ? draftText : queueStory.text;
    const approvedStory: Story = {
      ...queueStory,
      text: finalText,
      approvedBy: settings.displayName || undefined,
    };
    setCart((c) => [...c, approvedStory]);
    markPost(queueStory.id, "approved");
    setUndoStack((u) => [...u, { type: "approved", story: queueStory, index: currentIndex }]);
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
    setDraftText("");
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
    setDraftText("");
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
    const item = cart.find((c) => c.id === id);
    if (!item) return;
    setReviewingCartId(id);
    setDraftText(item.text);
    setEditMode(true);
  }

  function saveCartEdit() {
    if (!reviewingCartId) return;
    setCart((c) =>
      c.map((s) => (s.id === reviewingCartId ? { ...s, text: draftText } : s))
    );
    setReviewingCartId(null);
    setEditMode(false);
  }

  function startEditQueueStory() {
    if (!queueStory) return;
    setDraftText(queueStory.text);
    setEditMode(true);
  }

  function downloadCart() {
    let out = "";
    for (const s of cart) {
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

  // --- keyboard shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!settings.hotkeysEnabled || settingsOpen) return;
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (cartStory) {
          saveCartEdit();
        } else if (editMode) {
          setEditMode(false);
        }
        return;
      }

      if (isTyping || !currentStory) return;

      const key = e.key.toLowerCase();
      if (key === "a" && !cartStory) {
        e.preventDefault();
        approve();
      } else if (key === "s" && !cartStory) {
        e.preventDefault();
        skip();
      } else if (key === "e") {
        e.preventDefault();
        if (editMode) {
          setEditMode(false);
        } else if (cartStory) {
          setDraftText(cartStory.text);
          setEditMode(true);
        } else if (queueStory) {
          setDraftText(queueStory.text);
          setEditMode(true);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (checkingAuth) {
    return <div className="min-h-screen bg-black" />;
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-black text-neutral-300 flex items-center justify-center">
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-8 w-80">
          <h1 className="text-xl font-semibold text-white mb-4 tracking-tight">Reddit Story Tool</h1>
          <input
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 placeholder-neutral-600 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-neutral-600"
            autoFocus
          />
          {authError && <p className="text-red-400 text-sm mb-3">{authError}</p>}
          <button
            onClick={handleLogin}
            className={`w-full border text-white rounded-lg py-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  const cardPadding = settings.density === "compact" ? "p-5" : "p-8";
  const fontSizeClass = FONT_SIZE_CLASS[settings.fontSize];
  const progressPct = stories.length > 0 ? Math.min(100, (currentIndex / stories.length) * 100) : 0;

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

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 w-96 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">Settings</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-xs text-neutral-500 block mb-2">Accent Color</label>
                <div className="flex gap-2">
                  {(Object.keys(ACCENTS) as AppSettings["accent"][]).map((key) => (
                    <button
                      key={key}
                      onClick={() => updateSetting("accent", key)}
                      title={ACCENTS[key].label}
                      className={`w-7 h-7 rounded-full transition-all ${ACCENTS[key].solid} ${
                        settings.accent === key
                          ? `ring-2 ring-offset-2 ring-offset-neutral-950 ${ACCENTS[key].ring}`
                          : "opacity-50 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 block mb-2">Text Size</label>
                <div className="flex gap-2">
                  {(["sm", "base", "lg"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSetting("fontSize", size)}
                      className={`flex-1 rounded-lg py-1.5 text-sm border transition-colors ${
                        settings.fontSize === size
                          ? "bg-neutral-800 border-neutral-600 text-white"
                          : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {size === "sm" ? "Small" : size === "base" ? "Medium" : "Large"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 block mb-2">Density</label>
                <div className="flex gap-2">
                  {(["comfortable", "compact"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => updateSetting("density", d)}
                      className={`flex-1 rounded-lg py-1.5 text-sm border transition-colors capitalize ${
                        settings.density === d
                          ? "bg-neutral-800 border-neutral-600 text-white"
                          : "bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {d === "comfortable" ? "Comfortable" : "Compact"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 block mb-2">
                  Voiceover speed (words/min)
                </label>
                <input
                  type="number"
                  value={settings.wpm}
                  onChange={(e) => updateSetting("wpm", Number(e.target.value) || 150)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-neutral-600"
                />
                <p className="text-[11px] text-neutral-600 mt-1">
                  Используется для оценки длительности озвучки рядом со счётчиком слов.
                </p>
              </div>

              <div>
                <label className="text-xs text-neutral-500 block mb-2">Your name (optional)</label>
                <input
                  type="text"
                  value={settings.displayName}
                  onChange={(e) => updateSetting("displayName", e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-600 rounded-lg px-2 py-1.5 focus:outline-none focus:border-neutral-600"
                />
                <p className="text-[11px] text-neutral-600 mt-1">
                  Будет отмечено рядом с историями, которые ты одобришь в корзине.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-300">Hotkeys (A / S / E)</span>
                <Toggle
                  checked={settings.hotkeysEnabled}
                  onChange={(v) => updateSetting("hotkeysEnabled", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-300">Confirm before Skip</span>
                <Toggle
                  checked={settings.confirmSkip}
                  onChange={(v) => updateSetting("confirmSkip", v)}
                />
              </div>

              <p className="text-[11px] text-neutral-600 pt-3 border-t border-neutral-800">
                Значения фильтров слева (Min/Max Words, Min Upvotes) сохраняются автоматически и
                подставятся при следующем заходе.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <div className="flex flex-col w-72 bg-neutral-950 border-r border-neutral-800 shrink-0">
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
              <input
                type="file"
                accept=".jsonl"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm text-neutral-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-neutral-800 file:bg-neutral-900 file:text-neutral-300 file:text-xs"
              />
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
                disabled={!file || loading}
                className={`w-full border text-white rounded-lg py-2 font-medium transition-colors disabled:opacity-30 ${ACCENTS[settings.accent].button}`}
              >
                {loading ? "Loading..." : "Load and Shuffle"}
              </button>
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
                <button
                  onClick={downloadCart}
                  className={`w-full flex items-center justify-center gap-2 border text-white rounded-lg py-2 mt-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
                >
                  <Download size={16} /> DOWNLOAD SCRIPT (.txt)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="flex-1 px-6 py-8 md:px-10 md:py-12 max-w-4xl mx-auto w-full leading-relaxed">
        <h1 className="text-3xl font-semibold text-white tracking-tight mb-4">Reddit Story Tool</h1>

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
            Загрузи дамп слева и нажми “Load and Shuffle”, чтобы начать.
          </p>
        )}

        {currentStory && (
          <div className={`bg-neutral-950 border border-neutral-800 rounded-xl ${cardPadding}`}>
            <div className="flex justify-between items-start gap-4 mb-2">
              <h2 className="text-2xl font-semibold text-white tracking-tight">{currentStory.title}</h2>
              <button
                onClick={() => {
                  if (editMode) {
                    setEditMode(false);
                    return;
                  }
                  if (cartStory) {
                    setDraftText(cartStory.text);
                    setEditMode(true);
                    return;
                  }
                  if (queueStory) {
                    setDraftText(queueStory.text);
                    setEditMode(true);
                  }
                }}
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
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={14}
                className={`w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg p-4 leading-relaxed focus:outline-none focus:border-neutral-600 ${fontSizeClass}`}
              />
            ) : (
              <p className={`whitespace-pre-wrap leading-relaxed text-neutral-300 ${fontSizeClass}`}>
                {keyword.trim() ? highlightText(currentStory.text, keyword) : currentStory.text}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              {cartStory ? (
                <button
                  onClick={saveCartEdit}
                  className={`flex-1 flex items-center justify-center gap-2 border text-white rounded-lg py-2 font-medium transition-colors ${ACCENTS[settings.accent].button}`}
                >
                  <Save size={16} /> Save Edits
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
      </div>
    </div>
  );
}
