"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createRoom = () => {
    setLoading(true);
    const roomId = Math.random().toString(36).slice(2, 8);
    router.push(`/room/${roomId}`);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <div className="mb-10 text-center">
          <div className="mb-4 text-6xl">🍱</div>
          <h1 className="text-3xl font-extrabold tracking-tight">점심 뽑기</h1>
          <p className="mt-2 text-sm text-slate-400">
            Google Sheets의 식당 목록을 동료와 함께 룰렛으로 돌려요
          </p>
        </div>

        <button
          onClick={createRoom}
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-8 py-4 text-lg font-bold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] disabled:opacity-50"
        >
          {loading ? "방 만드는 중..." : "새 추첨방 만들기 →"}
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          방을 만든 뒤 URL을 동료에게 공유하면
          <br />
          모두가 같은 화면에서 같은 결과를 봅니다.
        </p>
      </div>
    </main>
  );
}
