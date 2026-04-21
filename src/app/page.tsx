"use client";

import { useEffect, useState } from "react";
import { extractSheetId } from "@/lib/sheets";
import Lottery from "@/components/Lottery";

const STORAGE_KEY = "lunch:sheetId";

type UIState = "hydrating" | "setup" | "connected";

export default function Home() {
  const [ui, setUi] = useState<UIState>("hydrating");
  const [sheetId, setSheetId] = useState<string>("");

  // Hydrate: ?sheet=... URL param takes precedence (shared link),
  // then fall back to localStorage.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("sheet");
      if (fromUrl) {
        const id = extractSheetId(fromUrl) ?? fromUrl;
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* ignore */
        }
        // Clean query string so refreshes use the stored value and the
        // URL stays tidy.
        window.history.replaceState(null, "", window.location.pathname);
        setSheetId(id);
        setUi("connected");
        return;
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSheetId(saved);
        setUi("connected");
        return;
      }
    } catch {
      /* ignore storage errors (private mode, etc.) */
    }
    setUi("setup");
  }, []);

  const connect = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setSheetId(id);
    setUi("connected");
  };

  const disconnect = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSheetId("");
    setUi("setup");
  };

  if (ui === "hydrating") {
    return <main className="min-h-screen bg-slate-950" />;
  }

  if (ui === "connected" && sheetId) {
    return <Lottery sheetId={sheetId} onDisconnect={disconnect} />;
  }

  return <Setup onConnect={connect} />;
}

function Setup({ onConnect }: { onConnect: (sheetId: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const sheetId = extractSheetId(input);
    if (!sheetId) {
      setError("올바른 Google Sheets URL을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/restaurants?sheetId=${encodeURIComponent(sheetId)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          json.error ??
            "시트를 읽을 수 없어요. '링크가 있는 모든 사용자'로 공유되어 있는지 확인해주세요."
        );
        return;
      }
      onConnect(sheetId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
        <div className="mb-10 text-center">
          <div className="mb-4 text-6xl">🍱</div>
          <h1 className="text-3xl font-extrabold tracking-tight">점심 뽑기</h1>
          <p className="mt-2 text-sm text-slate-400">
            Google Sheets를 연결하면 같은 시트를 쓰는 동료와 자동으로 연동됩니다
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Google Sheets URL
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="mt-2 w-full rounded-lg bg-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          <div className="rounded-lg bg-white/5 p-3 text-xs text-slate-400">
            <p className="mb-1 font-medium text-slate-300">필수 조건</p>
            <ul className="space-y-0.5">
              <li>• 공유 설정: <strong>&quot;링크가 있는 모든 사용자 · 뷰어&quot;</strong></li>
              <li>
                • 컬럼 구조: A 음식 나라 / B 대분류 / <strong>C 식당 이름</strong> / D 종류 / E 위치 / F 위치 상세 / G 마지막 방문일 / H 방문일로부터
              </li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-8 py-4 text-lg font-bold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? "확인 중..." : "시트 연결하기 →"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          한 번 연결하면 이 브라우저에 저장되어 다음 방문부터 바로 추첨할 수 있어요
        </p>
      </div>
    </main>
  );
}
