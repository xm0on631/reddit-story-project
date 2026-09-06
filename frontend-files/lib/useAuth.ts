"use client";

import { useState } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Runs once on mount: if a password is already saved, verify it silently.
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

  async function login(password: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      localStorage.setItem("app_password", password);
      setAuthed(true);
      return true;
    }
    return false;
  }

  function authHeader(): Record<string, string> {
    return {
      "X-App-Password": typeof window !== "undefined" ? localStorage.getItem("app_password") || "" : "",
    };
  }

  return { authed, checkingAuth, login, authHeader };
}
