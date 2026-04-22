import {NextRequest, NextResponse} from "next/server";
import {handleClick} from "@/lib/spin-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({error: "invalid json"}, {status: 400});
    }

    const parsed = (body ?? {}) as {
        sheetId?: string;
        restaurantCount?: number;
        allowedIndices?: number[];
    };

    if (
        !parsed.sheetId ||
        typeof parsed.restaurantCount !== "number" ||
        parsed.restaurantCount <= 0
    ) {
        return NextResponse.json(
            {error: "sheetId와 restaurantCount(>0) 필요"},
            {status: 400}
        );
    }

    // allowedIndices는 안전을 위해 범위 검사 — 인덱스가 실제 식당 개수 안쪽이어야 함.
    const allowedIndices = Array.isArray(parsed.allowedIndices)
        ? parsed.allowedIndices.filter(
            (n): n is number =>
                Number.isInteger(n) && n >= 0 && n < parsed.restaurantCount!
        )
        : [];

    const {sessionId, isNew} = handleClick(
        parsed.sheetId,
        parsed.restaurantCount,
        allowedIndices
    );

    return NextResponse.json({ok: true, sessionId, isNew});
}
