export type Restaurant = {
  name: string;
  country: string; // A
  category: string; // B
  foodType: string; // D
  locationArea: string; // E
  locationDetail: string; // F (may be "카카오맵" etc.)
  lastVisit: string; // G raw text
  daysSinceVisit: number | null; // parsed from H ("4일 지남" → 4)
};

export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Minimal CSV parser that handles quoted fields, escaped quotes,
 * and CRLF line endings. Good enough for Google Sheets gviz output.
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (c === "\r" && csv[i + 1] === "\n") i += 2;
      else i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

function parseDaysSince(text: string): number | null {
  const m = text.match(/(\d+)\s*일/);
  return m ? parseInt(m[1], 10) : null;
}

export async function fetchRestaurants(sheetId: string): Promise<Restaurant[]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    sheetId
  )}/gviz/tq?tqx=out:csv`;

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(
      `시트를 불러올 수 없어요 (${res.status}). '링크가 있는 모든 사용자'로 공유됐는지 확인해주세요.`
    );
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];

  // rows[0] is header. Skip it.
  return rows
    .slice(1)
    .map((r): Restaurant => ({
      country: (r[0] ?? "").trim(),
      category: (r[1] ?? "").trim(),
      name: (r[2] ?? "").trim(),
      foodType: (r[3] ?? "").trim(),
      locationArea: (r[4] ?? "").trim(),
      locationDetail: (r[5] ?? "").trim(),
      lastVisit: (r[6] ?? "").trim(),
      daysSinceVisit: parseDaysSince((r[7] ?? "").trim()),
    }))
    .filter((r) => r.name.length > 0);
}
