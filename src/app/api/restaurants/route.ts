import { NextResponse } from "next/server";
import { DEFAULT_SHEET_ID, fetchRestaurants } from "@/lib/sheets";

export const revalidate = 60;

export async function GET() {
  try {
    const restaurants = await fetchRestaurants(DEFAULT_SHEET_ID);
    if (restaurants.length === 0) {
      return NextResponse.json(
        { error: "시트의 C열('식당 이름')에 식당이 없어요. 식당을 먼저 추가해주세요." },
        { status: 404 }
      );
    }
    return NextResponse.json({ restaurants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
