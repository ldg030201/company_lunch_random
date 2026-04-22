import {broker} from "./broker";

/**
 * 한 시트(방)당 하나의 활성 스핀 세션을 관리.
 * 첫 클릭이 세션을 만들고 이후 클릭은 부스트로 누적. 1.2초 동안 클릭이 없으면
 * 자동으로 settle(감속 + 당첨 확정)을 브로드캐스트.
 */

type Session = {
    sheetId: string;
    sessionId: string;
    winnerIndex: number;
    startedAt: number;
    boostCount: number;
    idleTimer: ReturnType<typeof setTimeout> | null;
    settled: boolean;
};

// 아이들 타이머: 이 시간 동안 클릭이 없으면 settle.
const IDLE_TIMEOUT_MS = 1200;
// settle 이벤트 브로드캐스트 시점과 실제 애니메이션 시작 시점 사이의 시차.
// 모든 클라이언트가 동시에 감속 시작하도록 절대 타임스탬프 여유.
const SETTLE_LEAD_MS = 200;
// 감속 애니메이션 기본 시간 + 부스트당 추가 시간.
const BASE_SETTLE_MS = 2200;
const PER_BOOST_MS = 100;
const MAX_SETTLE_MS = 5500;
// 세션 하나가 지속될 수 있는 최대 시간 (누군가 무한 클릭 방지).
const MAX_SESSION_MS = 20_000;

function newSessionId(): string {
    return Math.random().toString(36).slice(2, 10);
}

function pickWinner(allowedIndices: number[], restaurantCount: number): number {
    if (allowedIndices.length > 0) {
        return allowedIndices[Math.floor(Math.random() * allowedIndices.length)];
    }
    return Math.floor(Math.random() * restaurantCount);
}

// Next.js dev 핫 리로드 간에도 세션 상태가 유지되도록 globalThis에 저장.
type SessionsMap = Map<string, Session>;
type WithSessions = typeof globalThis & { __lunchSessions?: SessionsMap };
const g = globalThis as WithSessions;
const sessions: SessionsMap = g.__lunchSessions ?? (g.__lunchSessions = new Map());

function scheduleSettle(session: Session): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    const elapsed = Date.now() - session.startedAt;
    const budget = Math.max(0, MAX_SESSION_MS - elapsed);
    // 최대 세션 시간을 넘어가면 즉시 settle.
    if (budget === 0) {
        settleNow(session);
        return;
    }
    const delay = Math.min(IDLE_TIMEOUT_MS, budget);
    session.idleTimer = setTimeout(() => settleNow(session), delay);
}

function settleNow(session: Session): void {
    if (session.settled) return;
    session.settled = true;
    if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
    }
    const now = Date.now();
    const durationMs = Math.min(
        MAX_SETTLE_MS,
        BASE_SETTLE_MS + session.boostCount * PER_BOOST_MS
    );
    broker.broadcast(session.sheetId, {
        type: "spin:settle",
        sessionId: session.sessionId,
        winnerIndex: session.winnerIndex,
        startAt: now + SETTLE_LEAD_MS,
        durationMs,
    });
    // 늦게 붙은 클라이언트가 끝난 세션을 못 받는 일을 막기 위해, 세션은 잠시 뒤 제거.
    setTimeout(() => {
        const current = sessions.get(session.sheetId);
        if (current && current.sessionId === session.sessionId) {
            sessions.delete(session.sheetId);
        }
    }, durationMs + 2000);
}

export function handleClick(
    sheetId: string,
    restaurantCount: number,
    allowedIndices: number[]
): { sessionId: string; isNew: boolean } {
    const now = Date.now();
    let session = sessions.get(sheetId);

    // 기존 세션이 이미 settled 된 상태면 새 세션을 만듦.
    if (!session || session.settled) {
        const winnerIndex = pickWinner(allowedIndices, restaurantCount);
        session = {
            sheetId,
            sessionId: newSessionId(),
            winnerIndex,
            startedAt: now,
            boostCount: 0,
            idleTimer: null,
            settled: false,
        };
        sessions.set(sheetId, session);
        broker.broadcast(sheetId, {
            type: "spin:start",
            sessionId: session.sessionId,
            startAt: now,
        });
        scheduleSettle(session);
        return {sessionId: session.sessionId, isNew: true};
    }

    // 진행 중인 세션이면 부스트만.
    session.boostCount += 1;
    broker.broadcast(sheetId, {
        type: "spin:boost",
        sessionId: session.sessionId,
        boostAt: now,
        boostCount: session.boostCount,
    });
    scheduleSettle(session);
    return {sessionId: session.sessionId, isNew: false};
}
