import { EventEmitter } from "events";

/**
 * In-memory pub/sub for a single Node process. Works for local dev and
 * self-hosted persistent deployments; NOT for serverless/Edge environments
 * where requests do not share memory.
 */

export type DrawCommand = {
  winnerIndex: number;
  startAt: number;
  durationMs: number;
  drawId: string;
};

export type BrokerEvent =
  | { type: "draw"; payload: DrawCommand }
  | { type: "presence"; count: number };

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
    // Notify everyone (including the new subscriber) of the new count.
    this.broadcast(key, { type: "presence", count: next });

    return () => {
      emitter.off("event", handler);
      const c = Math.max(0, (this.counts.get(key) ?? 0) - 1);
      if (c === 0) {
        this.counts.delete(key);
        this.emitters.delete(key);
      } else {
        this.counts.set(key, c);
        this.broadcast(key, { type: "presence", count: c });
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

// Persist across Next.js dev hot reloads via globalThis.
type WithBroker = typeof globalThis & { __lunchBroker?: Broker };
const g = globalThis as WithBroker;
export const broker: Broker = g.__lunchBroker ?? (g.__lunchBroker = new Broker());
