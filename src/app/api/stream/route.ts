import {broker} from "@/lib/broker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const sheetId = url.searchParams.get("sheetId");
    if (!sheetId) {
        return new Response("sheetId required", {status: 400});
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            const send = (chunk: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(chunk));
                } catch {
                    closed = true;
                }
            };

            const unsubscribe = broker.subscribe(sheetId, (ev) => {
                send(`data: ${JSON.stringify(ev)}\n\n`);
            });

            // 연결 직후 초기 keep-alive 주석 라인 전송.
            send(`: connected\n\n`);

            // 프록시나 라우터가 유휴 연결을 끊지 않도록 15초마다 핑.
            const keepalive = setInterval(() => send(`: ping\n\n`), 15000);

            const onAbort = () => {
                closed = true;
                clearInterval(keepalive);
                unsubscribe();
                try {
                    controller.close();
                } catch {
                    /* 이미 닫힌 경우 무시 */
                }
            };
            req.signal.addEventListener("abort", onAbort);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
