import {strFromU8, unzipSync} from "fflate";

export type Restaurant = {
    name: string;
    country: string; // A
    category: string; // B
    foodType: string; // D
    locationArea: string; // E
    locationDetail: string; // F 표시 텍스트 (예: "카카오맵")
    mapUrl: string | null; // F 셀의 하이퍼링크 URL. =HYPERLINK() 함수 / plain URL 모두 지원.
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

function parseDaysSince(text: string): number | null {
    const m = text.match(/(\d+)\s*일/);
    return m ? parseInt(m[1], 10) : null;
}

type OdsCell = { text: string; href: string | null };

/**
 * ODS(content.xml)를 파싱해 행 단위로 셀 텍스트 + 하이퍼링크 URL을 추출.
 * gviz CSV/JSON은 =HYPERLINK() 함수 안의 URL을 노출하지 않지만, ODS export는
 * `<text:a xlink:href="...">` 형태로 URL을 보존하므로 ODS를 사용.
 */
function parseOdsRows(xml: string): OdsCell[][] {
    const rows: OdsCell[][] = [];
    const rowRegex = /<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g;
    const cellRegex = /<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell\b([^>]*)\/>/g;

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(xml)) !== null) {
        const rowContent = rowMatch[1];
        const cells: OdsCell[] = [];
        cellRegex.lastIndex = 0;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            // 자기 닫는 셀(<table:table-cell ... />)은 빈 셀.
            const attrs = cellMatch[1] ?? cellMatch[3] ?? "";
            const inner = cellMatch[2] ?? "";

            // `table:number-columns-repeated="N"` — 같은 빈 셀이 반복됨. 텍스트가 없으면 빈 셀로 늘려줌.
            const repeatMatch = attrs.match(/table:number-columns-repeated="(\d+)"/);
            const repeatCount = repeatMatch ? parseInt(repeatMatch[1], 10) : 1;

            const hrefMatch = inner.match(/xlink:href="([^"]+)"/);
            // 한 셀 안에 여러 <text:p>가 있을 수 있음(개행 등). 모두 모아서 줄바꿈으로 join.
            const paragraphTexts: string[] = [];
            const pRegex = /<text:p[^>]*>([\s\S]*?)<\/text:p>/g;
            let pMatch: RegExpExecArray | null;
            while ((pMatch = pRegex.exec(inner)) !== null) {
                paragraphTexts.push(pMatch[1].replace(/<[^>]+>/g, ""));
            }
            const text = decodeXmlEntities(paragraphTexts.join("\n").trim());

            const cell: OdsCell = {text, href: hrefMatch ? hrefMatch[1] : null};
            for (let i = 0; i < repeatCount; i++) {
                // 반복된 빈 셀은 텍스트/링크가 없으니 단일 객체 재사용 대신 복제.
                cells.push(i === 0 ? cell : {text: "", href: null});
            }
        }
        rows.push(cells);
    }
    return rows;
}

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

export async function fetchRestaurants(
    sheetId: string,
    opts?: { fresh?: boolean }
): Promise<Restaurant[]> {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
        sheetId
    )}/export?format=ods`;

    // 기본은 60초 캐시. fresh=true일 때만 Google Sheets까지 새로 다녀옴 (수동 동기화용).
    const fetchOpts: RequestInit = opts?.fresh
        ? {cache: "no-store"}
        : {next: {revalidate: 60}};

    const res = await fetch(url, fetchOpts);
    if (!res.ok) {
        throw new Error(
            `시트를 불러올 수 없어요 (${res.status}). '링크가 있는 모든 사용자'로 공유됐는지 확인해주세요.`
        );
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    const unzipped = unzipSync(buf, {filter: (f) => f.name === "content.xml"});
    const contentXml = unzipped["content.xml"];
    if (!contentXml) {
        throw new Error("ODS 파일에서 content.xml을 찾을 수 없어요.");
    }
    const xml = strFromU8(contentXml);
    const rows = parseOdsRows(xml);
    if (rows.length === 0) return [];

    // rows[0]은 헤더 행이므로 건너뜀. 비어있는 셀은 cells[i]가 undefined일 수 있음.
    return rows
        .slice(1)
        .map((cells): Restaurant => {
            const get = (i: number): OdsCell => cells[i] ?? {text: "", href: null};
            const fCell = get(5);
            // F열에 하이퍼링크가 있으면 그 URL 사용. 없으면 셀 텍스트가 plain URL일 때만 인정.
            const mapUrl = fCell.href
                ?? (/^https?:\/\//.test(fCell.text) ? fCell.text : null);

            return {
                country: get(0).text.trim(),
                category: get(1).text.trim(),
                name: get(2).text.trim(),
                foodType: get(3).text.trim(),
                locationArea: get(4).text.trim(),
                locationDetail: fCell.text.trim(),
                mapUrl,
                lastVisit: get(6).text.trim(),
                daysSinceVisit: parseDaysSince(get(7).text.trim()),
            };
        })
        .filter((r) => r.name.length > 0);
}
