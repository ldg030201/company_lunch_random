import { NextRequest, NextResponse } from "next/server";
import { broker, DrawCommand } from "@/lib/broker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidCmd(c: unknown): c is DrawCommand {
  if (!c || typeof c !== "object") return false;
  const cmd = c as Record<string, unknown>;
  return (
    typeof cmd.winnerIndex === "number" &&
    typeof cmd.startAt === "number" &&
    typeof cmd.durationMs === "number" &&
    typeof cmd.drawId === "string"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { sheetId, cmd } =
    (body as { sheetId?: string; cmd?: DrawCommand }) ?? {};
  if (!sheetId || !isValidCmd(cmd)) {
    return NextResponse.json({ error: "sheetId and cmd are required" }, { status: 400 });
  }

  broker.broadcast(sheetId, { type: "draw", payload: cmd });
  return NextResponse.json({ ok: true, subscribers: broker.count(sheetId) });
}
