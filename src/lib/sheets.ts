export const DEFAULT_SHEET_ID = "1KVZ-snvssAMZ2SWUuodHszKZPPmwGOmyIKc1JSgSfTM";

export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function parseSingleColumnCsv(csv: string): string[] {
  return csv
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
      }
      return trimmed;
    })
    .filter((v) => v.length > 0);
}

const HEADER_NAMES = new Set(["식당 이름", "식당", "restaurant", "name"]);

export async function fetchRestaurants(sheetId: string): Promise<string[]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    sheetId
  )}/gviz/tq?tqx=out:csv&range=C:C`;

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(
      `시트를 불러올 수 없어요 (${res.status}). '링크가 있는 모든 사용자'로 공유됐는지 확인해주세요.`
    );
  }
  const csv = await res.text();
  const values = parseSingleColumnCsv(csv);
  return values.filter((v) => !HEADER_NAMES.has(v.toLowerCase()));
}
