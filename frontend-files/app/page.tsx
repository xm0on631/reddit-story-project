"use client";

import { useState } from "react";

interface Story {
  id: string;
  title: string;
  text: string;
  words: number;
  score: number;
  date: string;
  url: string;
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

  // --- filters / upload panel ---
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [minWords, setMinWords] = useState(1);
  const [maxWords, setMaxWords] = useState(1000);
  const [minScore, setMinScore] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

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
    } catch (e) {
      alert("Не удалось связаться с бэкендом. Проверь, что он запущен и API_URL верный.");
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

  function approve() {
    if (!queueStory) return;
    const finalText = editMode && draftText ? draftText : queueStory.text;
    setCart((c) => [...c, { ...queueStory, text: finalText }]);
    markPost(queueStory.id, "approved");
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
    setDraftText("");
  }

  function skip() {
    if (!queueStory) return;
    markPost(queueStory.id, "skipped");
    setCurrentIndex((i) => i + 1);
    setEditMode(false);
    setDraftText("");
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
            className="w-full bg-neutral-800 hover:bg-white/10 border border-neutral-700 text-white rounded-lg py-2 font-medium transition-colors"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black text-neutral-300">
      {/* LEFT SIDEBAR */}
      <div className="flex flex-col w-72 bg-neutral-950 border-r border-neutral-800 shrink-0">
        {/* Filters / upload — collapsible */}
        <div className="border-b border-neutral-800">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-900 transition-colors"
          >
            <span className="uppercase tracking-wide text-xs text-neutral-500">Dump &amp; Filters</span>
            <span className="text-neutral-600">{filtersOpen ? "▾" : "▸"}</span>
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
                className="w-full bg-neutral-800 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-neutral-800 border border-neutral-700 text-white rounded-lg py-2 font-medium transition-colors"
              >
                {loading ? "Loading..." : "Load and Shuffle"}
              </button>
              {stories.length > 0 && (
                <p className="text-xs text-neutral-500">
                  Found {stories.length} new stories · reviewed {currentIndex}
                </p>
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
            <span className="text-neutral-600">{cartOpen ? "▾" : "▸"}</span>
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
                  </button>
                  <button
                    onClick={() => removeFromCart(s.id)}
                    className="text-neutral-600 hover:text-red-400 text-xs shrink-0 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {cart.length > 0 && (
                <button
                  onClick={downloadCart}
                  className="w-full bg-neutral-800 hover:bg-white/10 border border-neutral-700 text-white rounded-lg py-2 mt-2 font-medium transition-colors"
                >
                  DOWNLOAD SCRIPT (.txt)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="flex-1 px-6 py-8 md:px-10 md:py-12 max-w-4xl mx-auto w-full leading-relaxed">
        <h1 className="text-3xl font-semibold text-white tracking-tight mb-8">Reddit Story Tool</h1>

        {!currentStory && (
          <p className="text-neutral-500">
            Загрузи дамп слева и нажми “Load and Shuffle”, чтобы начать.
          </p>
        )}

        {currentStory && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-8">
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
                className="text-sm shrink-0 text-neutral-500 hover:text-white transition-colors"
              >
                {editMode ? "👁️ View" : "✏️ Edit"}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-6">
              Words: {currentStory.words} | Upvotes: {currentStory.score} | Date:{" "}
              {currentStory.date}
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
                className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg p-4 leading-relaxed focus:outline-none focus:border-neutral-600"
              />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-neutral-300 text-base">
                {currentStory.text}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              {cartStory ? (
                <button
                  onClick={saveCartEdit}
                  className="flex-1 bg-neutral-800 hover:bg-white/10 border border-neutral-700 text-white rounded-lg py-2 font-medium transition-colors"
                >
                  💾 Save Edits
                </button>
              ) : (
                <>
                  <button
                    onClick={approve}
                    className="flex-1 bg-neutral-800 hover:bg-white/10 border border-neutral-700 text-white rounded-lg py-2 font-medium transition-colors"
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
