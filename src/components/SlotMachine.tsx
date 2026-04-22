"use client";

import {motion, useAnimationControls} from "framer-motion";
import {useEffect, useRef, useState} from "react";
import confetti from "canvas-confetti";
import type {SpinEvent} from "@/lib/broker";

type Props = {
    items: string[];
    event: SpinEvent | null;
    onFinish?: (winner: string) => void;
};

// 아이템 한 행의 높이(px). 컨테이너는 3행(= 264px)만 보여줌.
const ROW_HEIGHT = 88;
// 렌더할 반복 횟수. wrap 로직 덕에 8이면 충분 (작은 items.length도 커버).
const RENDER_CYCLES = 8;

// 포인터(룰렛 지시봉) 기하학 파라미터.
const POINTER_HEIGHT = 40; // 막대(28) + 삼각형(12)
const OUTER_PADDING_TOP = 40;
const POINTER_REST_Y = OUTER_PADDING_TOP + ROW_HEIGHT - POINTER_HEIGHT;
const POINTER_START_Y = -20; // 외곽 래퍼 위쪽 바깥에서 출발

// 자유 스핀 속도 (px/s) 및 물리 상수.
const INITIAL_VELOCITY = 1600;
const BOOST_INCREMENT = 600;
const MAX_VELOCITY = 6000;
const FRICTION = 300; // px/s^2
// settle 때 최소 이동 거리 — 너무 가까우면 "그냥 약간 보정"처럼 보임. 여유 있게.
const MIN_SETTLE_DISTANCE_PX = 700;
// settle 끝부분 바운스를 위한 오버슛 거리.
const OVERSHOOT_PX = 14;

type Phase = "idle" | "spinning" | "settling" | "done";

export default function SlotMachine({items, event, onFinish}: Props) {
    const reelControls = useAnimationControls();
    const pointerControls = useAnimationControls();
    const [phase, setPhase] = useState<Phase>("idle");
    const [winner, setWinner] = useState<string | null>(null);

    // 릴 상태 — RAF 루프에서 변경. React 리렌더와 무관해야 하므로 전부 ref.
    const reelYRef = useRef(0);
    const velocityRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number>(0);
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 처리한 이벤트 키 dedup (React StrictMode 이중 실행 대비).
    const handledRef = useRef<{
        startedSession: string | null;
        lastBoostAt: number;
        settledSession: string | null;
    }>({
        startedSession: null,
        lastBoostAt: -1,
        settledSession: null,
    });

    // wrap: cycle 길이로 y를 감아서 [-cycle, 0] 범위로 정규화.
    const wrapY = (y: number, cycle: number): number => {
        if (cycle <= 0) return 0;
        const m = y % cycle;
        // m은 y가 음수면 (-cycle, 0], 양수면 [0, cycle) 범위. 항상 음의 영역으로 맞춤.
        return m > 0 ? m - cycle : m;
    };

    const stopRaf = () => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const cancelPendingSettle = () => {
        if (settleTimerRef.current != null) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    };

    // 자유 스핀 시작. 기존에 돌던 것이 있으면 리셋.
    const startSpin = () => {
        stopRaf();
        cancelPendingSettle();
        reelControls.stop();

        setPhase("spinning");
        setWinner(null);
        velocityRef.current = INITIAL_VELOCITY;
        reelYRef.current = 0;
        reelControls.set({y: 0});

        // 포인터 낙하.
        pointerControls.stop();
        pointerControls.set({x: "-50%", y: POINTER_START_Y, opacity: 0});
        pointerControls.start({
            x: "-50%",
            y: POINTER_REST_Y,
            opacity: 1,
            transition: {duration: 0.4, ease: [0.2, 1.3, 0.4, 1]},
        });

        const cycle = items.length * ROW_HEIGHT;
        lastFrameRef.current = performance.now();
        const step = (now: number) => {
            const dt = (now - lastFrameRef.current) / 1000;
            lastFrameRef.current = now;

            velocityRef.current = Math.max(
                0,
                velocityRef.current - FRICTION * dt
            );
            reelYRef.current -= velocityRef.current * dt;

            // 시각적 y는 wrap — 아이템이 반복되므로 시각적 점프가 보이지 않음.
            reelControls.set({y: wrapY(reelYRef.current, cycle)});
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    };

    const boost = () => {
        velocityRef.current = Math.min(
            MAX_VELOCITY,
            velocityRef.current + BOOST_INCREMENT
        );
    };

    const startSettle = (
        winnerIndex: number,
        startAt: number,
        durationMs: number
    ) => {
        cancelPendingSettle();
        const delay = Math.max(0, startAt - Date.now());
        settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            performSettle(winnerIndex, durationMs);
        }, delay);
    };

    const performSettle = async (winnerIndex: number, durationMs: number) => {
        stopRaf();
        setPhase("settling");

        const cycle = items.length * ROW_HEIGHT;
        const currentVisibleY = wrapY(reelYRef.current, cycle);
        reelControls.set({y: currentVisibleY});

        // 가운데 슬롯에 winnerIndex가 오도록 하는 y의 조건:
        //   y ≡ (1 - winnerIndex) * ROW_HEIGHT  (mod cycle)
        // 또한 이동이 충분히 보이도록 target < currentVisibleY - MIN_SETTLE_DISTANCE_PX.
        const baseTargetY = (1 - winnerIndex) * ROW_HEIGHT;
        // [-cycle, 0] 범위로 정규화된 base.
        const normalizedBase = baseTargetY > 0 ? baseTargetY - cycle : baseTargetY;
        const minTarget = currentVisibleY - MIN_SETTLE_DISTANCE_PX;
        const k = Math.ceil((normalizedBase - minTarget) / cycle);
        const targetY = normalizedBase - k * cycle;

        const mainDuration = (durationMs / 1000) * 0.92;

        try {
            // 1단: 목표 직전까지 감속 (살짝 오버슛).
            await reelControls.start({
                y: targetY - OVERSHOOT_PX,
                transition: {
                    duration: mainDuration,
                    ease: [0.15, 0.75, 0.2, 1],
                },
            });
            // 2단: 스프링으로 정확한 목표에 안착.
            await reelControls.start({
                y: targetY,
                transition: {type: "spring", stiffness: 320, damping: 14, mass: 0.8},
            });
        } catch {
            // 애니메이션이 다른 start()에 의해 취소되면 무시.
            return;
        }

        // 다음 스핀이 이 지점부터 이어지도록 ref 업데이트.
        reelYRef.current = targetY;
        setPhase("done");
        const picked = items[winnerIndex];
        setWinner(picked);
        onFinish?.(picked);

        confetti({
            particleCount: 120,
            spread: 75,
            origin: {y: 0.55},
            colors: ["#fde68a", "#f472b6", "#60a5fa", "#34d399"],
        });
    };

    // 이벤트 디스패치.
    useEffect(() => {
        if (!event || items.length === 0) return;

        if (event.type === "spin:start") {
            if (handledRef.current.startedSession === event.sessionId) return;
            handledRef.current.startedSession = event.sessionId;
            handledRef.current.lastBoostAt = -1;
            handledRef.current.settledSession = null;
            startSpin();
        } else if (event.type === "spin:boost") {
            if (event.boostAt <= handledRef.current.lastBoostAt) return;
            handledRef.current.lastBoostAt = event.boostAt;
            // 스핀 중이 아니면 무시 (stale boost).
            if (phase === "spinning") boost();
        } else if (event.type === "spin:settle") {
            if (handledRef.current.settledSession === event.sessionId) return;
            handledRef.current.settledSession = event.sessionId;
            startSettle(event.winnerIndex, event.startAt, event.durationMs);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event]);

    // 언마운트 시 모든 진행 중 작업 정리.
    useEffect(() => {
        return () => {
            stopRaf();
            cancelPendingSettle();
        };
    }, []);

    // 릴에 렌더할 아이템 — RENDER_CYCLES 만큼 반복.
    const reel =
        items.length > 0
            ? Array.from({length: RENDER_CYCLES}).flatMap(() => items)
            : [];

    return (
        <div
            className="relative mx-auto w-full max-w-md"
            style={{paddingTop: OUTER_PADDING_TOP}}
        >
            {/* 룰렛 스타일 포인터: 위에서 아래로 내려와 끝이 가운데 슬롯 행의
          위쪽 모서리에 닿은 채로 머무름. */}
            <motion.div
                initial={{x: "-50%", y: POINTER_START_Y, opacity: 0}}
                animate={pointerControls}
                className="pointer-events-none absolute left-1/2 top-0 z-30"
            >
                <div className="flex flex-col items-center">
                    <div
                        className="h-7 w-1.5 rounded-t-sm bg-gradient-to-b from-amber-200 to-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]"/>
                    <div
                        className="h-0 w-0 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_2px_3px_rgba(251,191,36,0.55)]"/>
                </div>
            </motion.div>

            <div
                className="relative overflow-hidden rounded-2xl bg-slate-900/80 ring-1 ring-white/10"
                style={{height: ROW_HEIGHT * 3}}
            >
                {/* 가운데 당첨 슬롯 프레임 */}
                <div
                    className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[88px] -translate-y-1/2 rounded-xl border-2 border-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.35)]"/>
                {/* 위/아래 페이드 그라데이션 */}
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent"/>
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"/>

                <motion.div animate={reelControls} initial={{y: 0}} className="will-change-transform">
                    {reel.map((name, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-center text-2xl font-bold tracking-tight text-white"
                            style={{height: ROW_HEIGHT}}
                        >
                            <span className="truncate px-6">{name}</span>
                        </div>
                    ))}
                </motion.div>
            </div>

            <div className="mt-6 h-10 text-center">
                {phase === "spinning" && (
                    <p className="animate-pulse text-sm text-amber-300">연타하면 더 빨라져요!</p>
                )}
                {phase === "settling" && (
                    <p className="text-sm text-amber-300">멈추는 중...</p>
                )}
                {phase === "done" && winner && (
                    <motion.p
                        initial={{scale: 0.8, opacity: 0}}
                        animate={{scale: 1, opacity: 1}}
                        className="text-xl font-bold text-amber-300"
                    >
                        오늘은 <span className="text-white">{winner}</span>!
                    </motion.p>
                )}
            </div>
        </div>
    );
}
