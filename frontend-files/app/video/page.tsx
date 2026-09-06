"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

export default function VideoPage() {
  const { authed, checkingAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checkingAuth && !authed) router.replace("/");
  }, [checkingAuth, authed, router]);

  if (checkingAuth || !authed) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-neutral-300 p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Video Clips</h1>
        <Link href="/select" className="text-sm text-neutral-500 hover:text-white transition-colors">
          ← Сменить режим
        </Link>
      </div>
      <p className="text-neutral-500">
        Скоро здесь будет подбор видео-клипов (Discover-лента + добавление по ссылке).
      </p>
    </div>
  );
}
