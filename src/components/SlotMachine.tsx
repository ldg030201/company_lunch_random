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

// === 물리 상수 ===
// 첫 클릭의 목표 속도 (px/s). 즉시 이 값으로 점프하지 않고 ACCELERATION으로 ramp-up.
const BASE_TARGET_VELOCITY = 900;
// 추가 클릭당 목표 속도 증가량 (px/s).
const PER_BOOST_TARGET = 500;
// 목표 속도 상한.
const MAX_TARGET_VELOCITY = 5000;
// 가속도 (px/s²). 0에서 BASE까지 ~0.23s, BASE에서 MAX까지 ~1s.
const ACCELERATION = 4000;
// settle 단계에서 최소 이동 거리 (px). 너무 짧으면 감속 시간이 너무 빨라 어색함.
const MIN_SETTLE_DISTANCE_PX = 350;
// settle 균등 감속의 마찰 하한/상한 (px/s²) — 이상치 방어.
const MIN_SETTLE_FRICTION = 60;
const MAX_SETTLE_FRICTION = 4000;
// 안착 직후 바운스: target보다 이만큼 더 살짝 지나갔다가 스프링으로 돌아옴 (px).
const BOUNCE_OVERSHOOT_PX = 9;

type Phase = "idle" | "spinning" | "settling" | "done";

export default function SlotMachine({items, event, onFinish}: Props) {
    const reelControls = useAnimationControls();
    const pointerControls = useAnimationControls();
    const [phase, setPhase] = useState<Phase>("idle");
    const [winner, setWinner] = useState<string | null>(null);

    // 릴 상태 — RAF 루프에서 변경. React 리렌더와 무관해야 하므로 전부 ref.
    const reelYRef = useRef(0);
    const velocityRef = useRef(0);
    const targetVelocityRef = useRef(0);
    const clickCountRef = useRef(0);
    // settle 단계에서 사용할 마찰값. v²/(2d)로 계산해 정확히 target에서 0이 되도록.
    const settleFrictionRef = useRef(0);
    // settle 단계의 정확한 target Y (unwrap 좌표). 이 위치에서 velocity가 0이 됨.
    const settleTargetYRef = useRef(0);
    // settle 이벤트로 받은 당첨 정보. null이면 RAF는 가속/유지 모드, 있으면 감속 모드.
    const winnerInfoRef = useRef<{ winnerIndex: number; durationMs: number } | null>(null);

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

    // RAF 루프 — startSpin / continueSpin이 공통으로 사용.
    const runRafLoop = () => {
        const cycle = items.length * ROW_HEIGHT;
        lastFrameRef.current = performance.now();
        const step = (now: number) => {
            // dt를 너무 큰 값으로 두면(탭 백그라운드 등) 한 번에 거대한 점프가 생기므로 클램프.
            const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
            lastFrameRef.current = now;

            if (winnerInfoRef.current === null) {
                // 가속/유지 모드: target까지 ramp-up, target에 도달하면 그대로 유지.
                if (velocityRef.current < targetVelocityRef.current) {
                    velocityRef.current = Math.min(
                        targetVelocityRef.current,
                        velocityRef.current + ACCELERATION * dt
                    );
                }
                reelYRef.current -= velocityRef.current * dt;
            } else {
                // 감속 모드: 균등 마찰로 감속해서 정확히 settleTargetYRef에서 velocity=0이 되도록 설계됨.
                velocityRef.current = Math.max(
                    0,
                    velocityRef.current - settleFrictionRef.current * dt
                );
                reelYRef.current -= velocityRef.current * dt;

                // target 도달했거나 속도 소진 → 스냅 후 작은 바운스로 마무리.
                if (
                    reelYRef.current <= settleTargetYRef.current ||
                    velocityRef.current <= 0
                ) {
                    reelYRef.current = settleTargetYRef.current;
                    velocityRef.current = 0;
                    reelControls.set({y: wrapY(reelYRef.current, cycle)});
                    stopRaf();
                    triggerBounce(winnerInfoRef.current.winnerIndex);
                    return;
                }
            }

            // 시각적 y는 wrap — 아이템이 반복되므로 시각적 점프가 보이지 않음.
            reelControls.set({y: wrapY(reelYRef.current, cycle)});
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    };

    // 완전히 새로운 자유 스핀 시작 — idle/done 상태에서 호출.
    // 위치/속도/포인터 모두 초기화.
    const startSpin = () => {
        stopRaf();
        cancelPendingSettle();
        reelControls.stop();

        setPhase("spinning");
        setWinner(null);

        // 첫 클릭의 목표 속도를 설정. 실제 속도는 0에서 ramp-up.
        clickCountRef.current = 1;
        targetVelocityRef.current = BASE_TARGET_VELOCITY;
        velocityRef.current = 0;
        reelYRef.current = 0;
        winnerInfoRef.current = null;
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

        runRafLoop();
    };

    // 진행 중인 스핀(spinning/settling) 상태에서 사용자가 다시 클릭한 경우 — 부드럽게 이어감.
    // 위치/속도/포인터를 그대로 유지하고, target만 부스트해서 가속 모드로 복귀.
    const continueSpin = () => {
        stopRaf();
        cancelPendingSettle();
        reelControls.stop(); // settling 서브-페이즈 2의 FM bounce가 진행 중일 수 있음

        setPhase("spinning");
        setWinner(null);

        // settle 정보 클리어 → RAF가 가속/유지 모드로 복귀.
        winnerInfoRef.current = null;

        // 클릭 카운트 누적, target 상향. 현재 속도가 더 빠르면 그대로 유지(슬로다운 방지).
        clickCountRef.current += 1;
        const naturalTarget =
            BASE_TARGET_VELOCITY + (clickCountRef.current - 1) * PER_BOOST_TARGET;
        targetVelocityRef.current = Math.min(
            MAX_TARGET_VELOCITY,
            Math.max(velocityRef.current, naturalTarget)
        );

        // FM bounce가 reel을 잠깐 다른 위치로 옮겼을 수 있으니, RAF 좌표(reelYRef)와 시각 동기화.
        const cycle = items.length * ROW_HEIGHT;
        reelControls.set({y: wrapY(reelYRef.current, cycle)});

        runRafLoop();
    };

    // 추가 클릭 → 목표 속도 상향. 실제 속도는 RAF에서 ACCELERATION으로 자연스럽게 따라감.
    const boost = () => {
        clickCountRef.current += 1;
        targetVelocityRef.current = Math.min(
            MAX_TARGET_VELOCITY,
            BASE_TARGET_VELOCITY + (clickCountRef.current - 1) * PER_BOOST_TARGET
        );
    };

    // 서버 settle 이벤트를 startAt 시각에 적용 — 모든 클라이언트가 동시에 감속 시작.
    const startSettle = (
        winnerIndex: number,
        startAt: number,
        durationMs: number
    ) => {
        cancelPendingSettle();
        const delay = Math.max(0, startAt - Date.now());
        settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            beginSettle(winnerIndex, durationMs);
        }, delay);
    };

    const beginSettle = (winnerIndex: number, durationMs: number) => {
        const cycle = items.length * ROW_HEIGHT;
        const v = velocityRef.current;

        // 가운데 슬롯에 winnerIndex가 오도록 하는 y의 조건:
        //   y ≡ (1 - winnerIndex) * ROW_HEIGHT  (mod cycle)
        const baseTargetY = (1 - winnerIndex) * ROW_HEIGHT;
        const normalizedBase = baseTargetY > 0 ? baseTargetY - cycle : baseTargetY;

        // 자연 감속 거리 = v*t/2. 너무 짧으면 어색하므로 하한 적용.
        const naturalDistance = Math.max(
            MIN_SETTLE_DISTANCE_PX,
            (v * durationMs) / 2000
        );
        const minTarget = reelYRef.current - naturalDistance;
        const k = Math.ceil((normalizedBase - minTarget) / cycle);
        const targetY = normalizedBase - k * cycle;
        settleTargetYRef.current = targetY;

        // RAF가 안 돌고 있는 edge case (속도 0, 정지 상태에서 settle 받음): 곧장 바운스로.
        if (v <= 0 || rafRef.current == null) {
            reelYRef.current = targetY;
            reelControls.set({y: wrapY(targetY, cycle)});
            winnerInfoRef.current = {winnerIndex, durationMs};
            triggerBounce(winnerIndex);
            return;
        }

        // 마찰: f = v² / (2d) → 균등 감속으로 정확히 거리 d에서 v=0이 됨.
        const actualDistance = Math.max(1, reelYRef.current - targetY);
        const friction = (v * v) / (2 * actualDistance);
        settleFrictionRef.current = Math.min(
            MAX_SETTLE_FRICTION,
            Math.max(MIN_SETTLE_FRICTION, friction)
        );
        winnerInfoRef.current = {winnerIndex, durationMs};
    };

    // settle 끝나서 정확히 target에 멈춘 뒤 호출 — 작은 오버슛 + 스프링 바운스만.
    const triggerBounce = async (winnerIndex: number) => {
        const cycle = items.length * ROW_HEIGHT;
        const target = settleTargetYRef.current;
        const wrappedTarget = wrapY(target, cycle);

        try {
            // 1단: 진행 방향(아래쪽 = 더 음수)으로 살짝 더 미끄러짐. 짧고 빠르게.
            await reelControls.start({
                y: wrappedTarget - BOUNCE_OVERSHOOT_PX,
                transition: {duration: 0.14, ease: [0.3, 0, 0.5, 1]},
            });
            // 2단: 스프링으로 정확한 target에 살짝 튕기며 안착.
            await reelControls.start({
                y: wrappedTarget,
                transition: {type: "spring", stiffness: 360, damping: 16, mass: 0.7},
            });
        } catch {
            // 다른 start()가 끼어들어서 취소되면 무시.
            return;
        }

        reelYRef.current = target;
        velocityRef.current = 0;
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
            // 이미 회전/감속 중이면 이어가기로 — 위치/포인터 리셋 없이 부스트만.
            // idle/done 상태에서 시작이면 새로 출발 (포인터 낙하 포함).
            if (phase === "spinning" || phase === "settling") {
                continueSpin();
            } else {
                startSpin();
            }
        } else if (event.type === "spin:boost") {
            if (event.boostAt <= handledRef.current.lastBoostAt) return;
            handledRef.current.lastBoostAt = event.boostAt;
            // 감속 단계로 진입했으면 부스트 무시 (이미 settle된 세션의 stale 이벤트 가능성).
            if (winnerInfoRef.current === null && phase === "spinning") boost();
        } else if (event.type === "spin:settle") {
            if (handledRef.current.settledSession === event.sessionId) return;
            handledRef.current.settledSession = event.sessionId;
            setPhase("settling");
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
                    <div className="h-7 w-1.5 rounded-t-sm bg-gradient-to-b from-amber-200 to-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]"/>
                    <div className="h-0 w-0 border-x-[9px] border-t-[12px] border-x-transparent border-t-amber-400 drop-shadow-[0_2px_3px_rgba(251,191,36,0.55)]"/>
                </div>
            </motion.div>

            <div
                className="relative overflow-hidden rounded-2xl bg-slate-900/80 ring-1 ring-white/10"
                style={{height: ROW_HEIGHT * 3}}
            >
                {/* 가운데 당첨 슬롯 프레임 */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[88px] -translate-y-1/2 rounded-xl border-2 border-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.35)]"/>
                {/* 위/아래 페이드 그라데이션 */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent"/>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"/>

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
