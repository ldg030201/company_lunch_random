"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import SlotMachine, { DrawCommand } from "@/components/SlotMachine";
import Filters, { FilterState, emptyFilter, filterRestaurants } from "@/components/Filters";
import { getSupabase, randomUserId } from "@/lib/supabase";
import type { Restaurant } from "@/lib/sheets";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; restaurants: Restaurant[] };

const ANIM_MS = 4200;
const LEAD_MS = 350;

type Props = {
  sheetId: string;
  onDisconnect: () => void;
};

export default function Lottery({ sheetId, onDisconnect }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [draw, setDraw] = useState<DrawCommand | null>(null);
  const [winner, setWinner] = useState<Restaurant | null>(null);
  const [participants, setParticipants] = useState<number>(1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [filter, setFilter] = useState<FilterState>(emptyFilter);
  const [copied, setCopied] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string>("");
  if (!userIdRef.current) userIdRef.current = randomUserId();

  const restaurants = state.status === "ready" ? state.restaurants : [];
  const eligible = useMemo(
    () => filterRestaurants(restaurants, filter),
    [restaurants, filter]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState({ status: "loading" });
        const res = await fetch(`/api/restaurants?sheetId=${encodeURIComponent(sheetId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: json.error ?? "식당 목록을 불러올 수 없어요." });
          return;
        }
        setState({ status: "ready", restaurants: json.restaurants as Restaurant[] });
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetId]);

  useEffect(() => {
    if (!sheetId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase.channel(`sheet:${sheetId}`, {
      config: { broadcast: { self: true }, presence: { key: userIdRef.current } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "draw" }, ({ payload }) => {
      setDraw(payload as DrawCommand);
      setIsSpinning(true);
      setWinner(null);
    });

    channel.on("presence", { event: "sync" }, () => {
      const snap = channel.presenceState();
      setParticipants(Object.keys(snap).length);
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
  }, [sheetId]);

  const triggerDraw = async () => {
    if (state.status !== "ready" || isSpinning) return;
    if (eligible.length === 0) return;

    const winnerRestaurant = eligible[Math.floor(Math.random() * eligible.length)];
    const winnerIndex = state.restaurants.indexOf(winnerRestaurant);
    if (winnerIndex < 0) return;

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
      setDraw(cmd);
      setIsSpinning(true);
      setWinner(null);
    }
  };

  const onSpinFinish = () => {
    setIsSpinning(false);
    if (draw && state.status === "ready") {
      setWinner(state.restaurants[draw.winnerIndex] ?? null);
    }
  };

  const slotItems = restaurants.map((r) => r.name);

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/?sheet=${encodeURIComponent(sheetId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: show url in prompt so user can copy manually
      window.prompt("링크를 복사하세요:", url);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8 flex items-center justify-between gap-2">
          <button
            onClick={onDisconnect}
            className="text-sm text-slate-400 transition hover:text-red-300"
            title="시트 연동 해제"
          >
            ← 시트 연동 해제
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {participants}명
            </span>
            <button
              onClick={copyShareLink}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
              title="이 링크를 공유하면 동료도 자동으로 같은 시트에 연결돼요"
            >
              {copied ? "복사됨!" : "🔗 링크 공유"}
            </button>
          </div>
        </header>

        <h1 className="mb-1 text-center text-3xl font-extrabold">오늘의 점심</h1>
        <p className="mb-8 text-center text-sm text-slate-400">
          같은 시트를 쓰는 사람들과 결과를 실시간으로 공유해요
        </p>

        {state.status === "loading" && (
          <p className="text-center text-slate-400">식당 목록을 불러오는 중...</p>
        )}

        {state.status === "error" && (
          <div className="rounded-lg bg-red-950/50 p-4 text-center text-sm text-red-300">
            <div className="mb-3">{state.message}</div>
            <button
              onClick={onDisconnect}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              다른 시트 사용하기
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            <Filters
              restaurants={state.restaurants}
              filter={filter}
              setFilter={setFilter}
              eligibleCount={eligible.length}
            />

            <SlotMachine items={slotItems} draw={draw} onFinish={onSpinFinish} />

            {winner && !isSpinning && <WinnerCard winner={winner} />}

            <div className="mt-8 flex justify-center">
              <button
                onClick={triggerDraw}
                disabled={isSpinning || eligible.length === 0}
                className="rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-10 py-4 text-lg font-bold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {isSpinning
                  ? "추첨 중..."
                  : eligible.length === 0
                    ? "조건에 맞는 식당 없음"
                    : "🎰 점심 뽑기"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function WinnerCard({ winner }: { winner: Restaurant }) {
  const tags = [winner.country, winner.category, winner.foodType].filter((v) => v);
  const mapQuery = [winner.name, winner.locationArea].filter(Boolean).join(" ");
  const mapUrl = `https://map.kakao.com/?q=${encodeURIComponent(mapQuery)}`;

  return (
    <div className="mt-6 rounded-2xl bg-gradient-to-br from-amber-400/20 to-pink-500/20 p-5 ring-1 ring-amber-400/40">
      <div className="text-2xl font-extrabold text-white">{winner.name}</div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-amber-200"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {winner.locationArea && <InfoRow label="위치" value={winner.locationArea} />}
        {winner.lastVisit && (
          <InfoRow
            label="마지막 방문"
            value={`${winner.lastVisit}${
              winner.daysSinceVisit != null ? ` (${winner.daysSinceVisit}일 전)` : ""
            }`}
          />
        )}
      </dl>

      <div className="mt-4">
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
        >
          🗺 카카오맵에서 보기 ↗
        </a>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-100">{value}</dd>
    </div>
  );
}
