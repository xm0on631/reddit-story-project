"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

export default function SelectPage() {
  const { authed, checkingAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checkingAuth && !authed) router.replace("/");
  }, [checkingAuth, authed, router]);

  if (checkingAuth || !authed) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <div className="min-h-screen bg-black text-neutral-300 flex items-center justify-center p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full">
        <Link
          href="/stories"
          className="bg-neutral-950 border border-neutral-800 hover:border-neutral-600 rounded-xl p-8 text-center transition-colors"
        >
          <h2 className="text-xl font-semibold text-white mb-2">Истории</h2>
          <p className="text-sm text-neutral-500">Поиск и отбор текстовых историй Reddit</p>
        </Link>
        <Link
          href="/video"
          className="bg-neutral-950 border border-neutral-800 hover:border-neutral-600 rounded-xl p-8 text-center transition-colors"
        >
          <h2 className="text-xl font-semibold text-white mb-2">Видео</h2>
          <p className="text-sm text-neutral-500">Подбор коротких вирусных клипов</p>
        </Link>
      </div>
    </div>
  );
}
