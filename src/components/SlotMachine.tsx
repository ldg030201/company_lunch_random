"use client";

import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

export type DrawCommand = {
  winnerIndex: number;
  startAt: number;
  durationMs: number;
  drawId: string;
};

type Props = {
  items: string[];
  draw: DrawCommand | null;
  onFinish?: (winner: string) => void;
};

const ROW_HEIGHT = 88;
const LOOPS = 6;

// 포인터 크기 (px).
const POINTER_HEIGHT = 40; // 막대(28) + 삼각형(12)
const OUTER_PADDING_TOP = 40;
// 정지 상태일 때 포인터의 뾰족한 끝이 가운데 슬롯 행의 위쪽 모서리에 닿도록.
// 외곽 래퍼 기준으로 가운데 행의 시작 y = OUTER_PADDING_TOP + ROW_HEIGHT.
const POINTER_REST_Y = OUTER_PADDING_TOP + ROW_HEIGHT - POINTER_HEIGHT;
const POINTER_START_Y = -20; // 외곽 래퍼 위쪽 바깥에서 출발

// 착지할 때 튕기는 오버슛 거리 (px).
const OVERSHOOT_PX = 14;

export default function SlotMachine({ items, draw, onFinish }: Props) {
  const reelControls = useAnimationControls();
  const pointerControls = useAnimationControls();
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [winner, setWinner] = useState<string | null>(null);
  const lastDrawRef = useRef<string | null>(null);

  useEffect(() => {
    if (!draw || items.length === 0) return;
    if (lastDrawRef.current === draw.drawId) return;
    lastDrawRef.current = draw.drawId;

    let cancelled = false;
    const run = async () => {
      setPhase("spinning");
      setWinner(null);

      const delay = Math.max(0, draw.startAt - Date.now());
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      if (cancelled) return;

      // 릴 계산: 3행짜리 뷰포트의 가운데 슬롯은 릴을 -N * ROW_HEIGHT만큼 이동하면
      // 인덱스 N+1번 아이템을 보여줌. 따라서 당첨 행을 가운데로 맞추려면
      // -(winnerRow - 1) * ROW_HEIGHT만큼 이동해야 함.
      const winnerRow = items.length * LOOPS + draw.winnerIndex;
      const targetY = -(winnerRow - 1) * ROW_HEIGHT;

      // 포인터 낙하 — 스핀 시작과 동시에 진행.
      pointerControls.start({
        x: "-50%",
        y: POINTER_REST_Y,
        opacity: 1,
        transition: { duration: 0.45, ease: [0.2, 1.3, 0.4, 1] },
      });

      // 메인 스핀: 목표보다 약간 더 지나쳐 가서 스프링으로 되돌아올 수 있게 함.
      const mainDuration = (draw.durationMs / 1000) * 0.92;

      await reelControls.start({
        y: targetY - OVERSHOOT_PX,
        transition: {
          duration: mainDuration,
          ease: [0.15, 0.75, 0.2, 1],
        },
      });
      if (cancelled) return;

      // 부드러운 스프링으로 정확한 목표 지점에 안착.
      await reelControls.start({
        y: targetY,
        transition: { type: "spring", stiffness: 320, damping: 14, mass: 0.8 },
      });
      if (cancelled) return;

      setPhase("done");
      const picked = items[draw.winnerIndex];
      setWinner(picked);
      onFinish?.(picked);

      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.55 },
        colors: ["#fde68a", "#f472b6", "#60a5fa", "#34d399"],
      });
    };

    reelControls.stop();
    reelControls.set({ y: 0 });
    pointerControls.stop();
    pointerControls.set({ x: "-50%", y: POINTER_START_Y, opacity: 0 });
    run();

    return () => {
      cancelled = true;
    };
  }, [draw, items, reelControls, pointerControls, onFinish]);

  const reel = items.length > 0 ? Array.from({ length: LOOPS + 2 }).flatMap(() => items) : [];

  return (
    <div
      className="relative mx-auto w-full max-w-md"
      style={{ paddingTop: OUTER_PADDING_TOP }}
    >
      {/* 룰렛 스타일 포인터: 위에서 아래로 내려와 끝이 가운데 슬롯 행의
          위쪽 모서리에 닿은 채로 머무름. */}
      <motion.div
        initial={{ x: "-50%", y: POINTER_START_Y, opacity: 0 }}
        animate={pointerControls}
        className="pointer-events-none absolute left-1/2 top-0 z-30"
      >
        <div className="flex flex-col items-center">
          <div className="h-7 w-1.5 rounded-t-sm bg-gradient-to-b from-amber-200 to-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]" />
          <div className="h-0 w-0 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_2px_3px_rgba(251,191,36,0.55)]" />
        </div>
      </motion.div>

      <div
        className="relative overflow-hidden rounded-2xl bg-slate-900/80 ring-1 ring-white/10"
        style={{ height: ROW_HEIGHT * 3 }}
      >
        {/* 가운데 당첨 슬롯 프레임 */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[88px] -translate-y-1/2 rounded-xl border-2 border-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.35)]" />
        {/* 위/아래 페이드 그라데이션 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />

        <motion.div animate={reelControls} initial={{ y: 0 }} className="will-change-transform">
          {reel.map((name, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center text-2xl font-bold tracking-tight text-white"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="truncate px-6">{name}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="mt-6 h-10 text-center">
        {phase === "spinning" && (
          <p className="animate-pulse text-sm text-amber-300">돌리는 중...</p>
        )}
        {phase === "done" && winner && (
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xl font-bold text-amber-300"
          >
            오늘은 <span className="text-white">{winner}</span>!
          </motion.p>
        )}
      </div>
    </div>
  );
}
