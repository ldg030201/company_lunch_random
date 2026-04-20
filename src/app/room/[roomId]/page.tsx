"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import SlotMachine, { DrawCommand } from "@/components/SlotMachine";
import { getSupabase, randomUserId } from "@/lib/supabase";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; restaurants: string[] };

const ANIM_MS = 4200;
const LEAD_MS = 350;

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [draw, setDraw] = useState<DrawCommand | null>(null);
  const [participants, setParticipants] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string>("");

  if (!userIdRef.current) userIdRef.current = randomUserId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/restaurants`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: json.error ?? "식당 목록을 불러올 수 없어요." });
          return;
        }
        setState({ status: "ready", restaurants: json.restaurants });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: true }, presence: { key: userIdRef.current } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "draw" }, ({ payload }) => {
      setDraw(payload as DrawCommand);
      setIsSpinning(true);
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      setParticipants(Object.keys(state).length);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ joinedAt: Date.now() });
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId]);

  const triggerDraw = async () => {
    if (state.status !== "ready" || isSpinning) return;
    const restaurants = state.restaurants;
    const winnerIndex = Math.floor(Math.random() * restaurants.length);
    const cmd: DrawCommand = {
      winnerIndex,
      startAt: Date.now() + LEAD_MS,
      durationMs: ANIM_MS,
      drawId: Math.random().toString(36).slice(2),
    };

    const channel = channelRef.current;
    if (channel) {
      await channel.send({ type: "broadcast", event: "draw", payload: cmd });
    } else {
      // Realtime not configured — still animate locally
      setDraw(cmd);
      setIsSpinning(true);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8 flex items-center justify-between">
          <a href="/" className="text-sm text-slate-400 hover:text-slate-200">
            ← 새 방
          </a>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {participants}명 접속
            </span>
            <button
              onClick={copyLink}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
            >
              {copied ? "복사됨!" : "링크 복사"}
            </button>
          </div>
        </header>

        <h1 className="mb-1 text-center text-3xl font-extrabold">오늘의 점심</h1>
        <p className="mb-10 text-center text-sm text-slate-400">
          모두가 같은 결과를 동시에 봐요
        </p>

        {state.status === "loading" && (
          <p className="text-center text-slate-400">식당 목록을 불러오는 중...</p>
        )}

        {state.status === "error" && (
          <div className="rounded-lg bg-red-950/50 p-4 text-center text-sm text-red-300">
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <>
            <SlotMachine
              items={state.restaurants}
              draw={draw}
              onFinish={() => setIsSpinning(false)}
            />

            <div className="mt-10 flex justify-center">
              <button
                onClick={triggerDraw}
                disabled={isSpinning}
                className="rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-10 py-4 text-lg font-bold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {isSpinning ? "추첨 중..." : "🎰 점심 뽑기"}
              </button>
            </div>

            <details className="mt-10 rounded-lg bg-white/5 p-4 text-sm text-slate-300">
              <summary className="cursor-pointer text-slate-400">
                후보 식당 {state.restaurants.length}곳 보기
              </summary>
              <ul className="mt-3 grid grid-cols-2 gap-1.5">
                {state.restaurants.map((name, i) => (
                  <li key={i} className="truncate text-slate-200">
                    • {name}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
