import { NextRequest, NextResponse } from "next/server";
import { fetchRestaurants } from "@/lib/sheets";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const sheetId = req.nextUrl.searchParams.get("sheetId");
  if (!sheetId) {
    return NextResponse.json({ error: "sheetId is required" }, { status: 400 });
  }

  try {
    const restaurants = await fetchRestaurants(sheetId);
    if (restaurants.length === 0) {
      return NextResponse.json(
        { error: "시트의 C열('식당 이름')에 식당이 없어요." },
        { status: 404 }
      );
    }
    return NextResponse.json({ restaurants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
