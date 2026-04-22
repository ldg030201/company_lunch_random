import {NextRequest, NextResponse} from "next/server";
import {fetchRestaurants} from "@/lib/sheets";

// 라우트 레벨 캐시는 쓰지 않음 — 캐시는 fetchRestaurants 안쪽에서만 담당.
// 그래야 ?fresh=1일 때 확실히 Google Sheets까지 다녀옴.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const sheetId = req.nextUrl.searchParams.get("sheetId");
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";

    if (!sheetId) {
        return NextResponse.json({error: "sheetId is required"}, {status: 400});
    }

    try {
        const restaurants = await fetchRestaurants(sheetId, {fresh});
        if (restaurants.length === 0) {
            return NextResponse.json(
                {error: "시트의 C열('식당 이름')에 식당이 없어요."},
                {status: 404}
            );
        }
        return NextResponse.json({restaurants});
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        return NextResponse.json({error: message}, {status: 500});
    }
}
