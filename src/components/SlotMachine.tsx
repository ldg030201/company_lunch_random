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

export default function SlotMachine({ items, draw, onFinish }: Props) {
  const controls = useAnimationControls();
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

      const totalRows = items.length * LOOPS + draw.winnerIndex;
      const targetY = -totalRows * ROW_HEIGHT;

      await controls.start({
        y: targetY,
        transition: {
          duration: draw.durationMs / 1000,
          ease: [0.15, 0.7, 0.2, 1],
        },
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

    controls.set({ y: 0 });
    run();

    return () => {
      cancelled = true;
    };
  }, [draw, items, controls, onFinish]);

  const reel = items.length > 0 ? Array.from({ length: LOOPS + 2 }).flatMap(() => items) : [];

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[88px] -translate-y-1/2 rounded-xl border-2 border-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.35)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />

      <div
        className="relative overflow-hidden rounded-2xl bg-slate-900/80 ring-1 ring-white/10"
        style={{ height: ROW_HEIGHT * 3 }}
      >
        <motion.div animate={controls} initial={{ y: 0 }} className="will-change-transform">
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
