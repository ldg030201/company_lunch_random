import {EventEmitter} from "events";

/**
 * 단일 Node 프로세스 안에서 동작하는 인메모리 pub/sub.
 * 로컬 개발 및 상시 가동 서버 배포에서는 OK, 서버리스/Edge 환경에서는
 * 요청들이 메모리를 공유하지 않으므로 동작하지 않음.
 */

// 세션 기반 스핀 이벤트. 서버가 세션 수명 주기를 관리하고 아래 3종을 브로드캐스트.
export type SpinEvent =
    | { type: "spin:start"; sessionId: string; startAt: number }
    | { type: "spin:boost"; sessionId: string; boostAt: number; boostCount: number }
    | {
    type: "spin:settle";
    sessionId: string;
    winnerIndex: number;
    startAt: number;
    durationMs: number;
};

export type BrokerEvent =
    | { type: "presence"; count: number }
    | SpinEvent;

class Broker {
    private emitters = new Map<string, EventEmitter>();
    private counts = new Map<string, number>();

    private getEmitter(key: string): EventEmitter {
        let e = this.emitters.get(key);
        if (!e) {
            e = new EventEmitter();
            e.setMaxListeners(200);
            this.emitters.set(key, e);
        }
        return e;
    }

    subscribe(key: string, handler: (ev: BrokerEvent) => void): () => void {
        const emitter = this.getEmitter(key);
        emitter.on("event", handler);

        const next = (this.counts.get(key) ?? 0) + 1;
        this.counts.set(key, next);
        // 방금 구독한 사람 포함 모두에게 바뀐 접속 인원을 알림.
        this.broadcast(key, {type: "presence", count: next});

        return () => {
            emitter.off("event", handler);
            const c = Math.max(0, (this.counts.get(key) ?? 0) - 1);
            if (c === 0) {
                this.counts.delete(key);
                this.emitters.delete(key);
            } else {
                this.counts.set(key, c);
                this.broadcast(key, {type: "presence", count: c});
            }
        };
    }

    broadcast(key: string, ev: BrokerEvent): void {
        const emitter = this.emitters.get(key);
        if (emitter) emitter.emit("event", ev);
    }

    count(key: string): number {
        return this.counts.get(key) ?? 0;
    }
}

// Next.js dev 핫 리로드 중에도 상태를 유지하도록 globalThis에 저장.
type WithBroker = typeof globalThis & { __lunchBroker?: Broker };
const g = globalThis as WithBroker;
export const broker: Broker = g.__lunchBroker ?? (g.__lunchBroker = new Broker());
