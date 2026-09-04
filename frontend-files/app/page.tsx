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
    return <div className="min-h-screen bg-[var(--bg)]" />;
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 w-80">
          <h1 className="text-xl font-semibold mb-4">Reddit Story Tool</h1>
          <input
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full bg-[var(--input)] border border-[var(--border)] rounded px-3 py-2 mb-3"
            autoFocus
          />
          {authError && <p className="text-red-400 text-sm mb-3">{authError}</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-[var(--accent)] text-white rounded py-2 font-medium"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* LEFT SIDEBAR */}
      <div className="flex flex-col w-72 border-r border-[var(--border)] shrink-0">
        {/* Filters / upload — collapsible */}
        <div className="border-b border-[var(--border)]">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-3 font-semibold hover:bg-[var(--surface-hover)]"
          >
            <span>Dump &amp; Filters</span>
            <span>{filtersOpen ? "▾" : "▸"}</span>
          </button>
          {filtersOpen && (
            <div className="px-4 pb-4 space-y-3">
              <input
                type="file"
                accept=".jsonl"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs opacity-70">Min Words</label>
                  <input
                    type="number"
                    value={minWords}
                    onChange={(e) => setMinWords(Number(e.target.value))}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs opacity-70">Max Words</label>
                  <input
                    type="number"
                    value={maxWords}
                    onChange={(e) => setMaxWords(Number(e.target.value))}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs opacity-70">Min Upvotes</label>
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="text-xs opacity-70">Contains Word (optional)</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white rounded py-2 font-medium"
              >
                {loading ? "Loading..." : "Load and Shuffle"}
              </button>
              {stories.length > 0 && (
                <p className="text-xs opacity-70">
                  Found {stories.length} new stories · reviewed {currentIndex}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cart — collapsible, pinned toward bottom */}
        <div className="mt-auto border-t border-[var(--border)]">
          <button
            onClick={() => setCartOpen((v) => !v)}
            className="w-full flex justify-between items-center px-4 py-3 font-semibold hover:bg-[var(--surface-hover)]"
          >
            <span>Cart ({cart.length})</span>
            <span>{cartOpen ? "▾" : "▸"}</span>
          </button>
          {cartOpen && (
            <div className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
              {cart.length === 0 && (
                <p className="text-xs opacity-50">Ничего не одобрено пока.</p>
              )}
              {cart.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 bg-[var(--surface)] rounded px-2 py-1.5 text-sm"
                >
                  <button
                    onClick={() => openCartItem(s.id)}
                    className="truncate text-left hover:underline flex-1"
                    title={s.title}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => removeFromCart(s.id)}
                    className="text-red-400 hover:text-red-300 text-xs shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {cart.length > 0 && (
                <button
                  onClick={downloadCart}
                  className="w-full bg-[var(--accent)] hover:opacity-90 text-white rounded py-2 mt-2 font-medium"
                >
                  DOWNLOAD SCRIPT (.txt)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6">Reddit Story Tool</h1>

        {!currentStory && (
          <p className="opacity-60">
            Загрузи дамп слева и нажми “Load and Shuffle”, чтобы начать.
          </p>
        )}

        {currentStory && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <div className="flex justify-between items-start gap-4 mb-1">
              <h2 className="text-xl font-semibold">{currentStory.title}</h2>
              <button
                onClick={
                  cartStory ? () => openCartItem(cartStory.id) : startEditQueueStory
                }
                className="text-sm shrink-0 opacity-80 hover:opacity-100"
              >
                ✏️ Edit
              </button>
            </div>
            <p className="text-xs opacity-60 mb-4">
              Words: {currentStory.words} | Upvotes: {currentStory.score} | Date:{" "}
              {currentStory.date}
              {currentStory.url && (
                <>
                  {" · "}
                  <a
                    href={currentStory.url}
                    target="_blank"
                    className="underline"
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
                className="w-full bg-[var(--input)] border border-[var(--border)] rounded p-3 leading-relaxed"
              />
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">
                {currentStory.text}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              {cartStory ? (
                <button
                  onClick={saveCartEdit}
                  className="flex-1 bg-[var(--accent)] text-white rounded py-2 font-medium"
                >
                  💾 Save Edits
                </button>
              ) : (
                <>
                  <button
                    onClick={approve}
                    className="flex-1 bg-[var(--accent)] text-white rounded py-2 font-medium"
                  >
                    APPROVE
                  </button>
                  <button
                    onClick={skip}
                    className="flex-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded py-2 font-medium"
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
