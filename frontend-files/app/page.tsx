"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { ACCENTS, DEFAULT_SETTINGS, SETTINGS_KEY, loadJSON } from "@/lib/settings";

export default function LoginPage() {
  const { authed, checkingAuth, login } = useAuth();
  const router = useRouter();
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const settings = loadJSON(SETTINGS_KEY, DEFAULT_SETTINGS);

  useEffect(() => {
    if (authed) router.replace("/select");
  }, [authed, router]);

  if (checkingAuth || authed) {
    return <div className="min-h-screen bg-black" />;
  }

  async function handleLogin() {
    setAuthError("");
    const ok = await login(passwordInput);
    if (!ok) setAuthError("Неверный пароль");
  }

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
