"use client";

import { useEffect, useMemo, useState } from "react";
import SlotMachine, { DrawCommand } from "@/components/SlotMachine";
import Filters, { FilterState, emptyFilter, filterRestaurants } from "@/components/Filters";
import type { Restaurant } from "@/lib/sheets";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; restaurants: Restaurant[] };

type SyncStatus = "connecting" | "live" | "error";

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
  const [sync, setSync] = useState<SyncStatus>("connecting");

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
    setSync("connecting");

    const es = new EventSource(`/api/stream?sheetId=${encodeURIComponent(sheetId)}`);

    es.onopen = () => setSync("live");
    es.onerror = () => {
      // EventSource가 자동 재연결을 시도함. 그동안은 에러 상태로 표시.
      setSync("error");
    };
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "draw") {
          setDraw(ev.payload as DrawCommand);
          setIsSpinning(true);
          setWinner(null);
        } else if (ev.type === "presence") {
          setParticipants(ev.count);
        }
      } catch {
        /* 형식이 깨진 프레임은 무시 */
      }
    };

    return () => {
      es.close();
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

    try {
      await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, cmd }),
      });
    } catch {
      // 네트워크 문제 — 뽑기를 누른 사람이라도 반응을 볼 수 있도록
      // 로컬에서만 애니메이션을 돌리는 폴백.
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
      // 클립보드 API가 막힌 경우 폴백: prompt 창으로 URL을 띄워 수동 복사 가능하게 함.
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
            <SyncBadge sync={sync} participants={participants} />
            <button
              onClick={copyShareLink}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
              title="이 링크를 공유하면 동료도 자동으로 같은 시트에 연결돼요"
            >
              {copied ? "복사됨!" : "🔗 링크 공유"}
            </button>
          </div>
        </header>

        {sync === "error" && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            ⚠️ 실시간 연결이 끊겼어요. 자동으로 재연결을 시도 중입니다. (서버가 꺼진 건 아닌지 확인해주세요)
          </div>
        )}

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

function SyncBadge({ sync, participants }: { sync: SyncStatus; participants: number }) {
  if (sync === "live") {
    return (
      <span className="flex items-center gap-1.5 text-slate-300" title="실시간 공유 활성">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {participants}명
      </span>
    );
  }
  if (sync === "connecting") {
    return (
      <span className="flex items-center gap-1.5 text-slate-400" title="실시간 서버에 연결 중">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        연결 중
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-red-300" title="실시간 연결 실패">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      연결 실패
    </span>
  );
}
