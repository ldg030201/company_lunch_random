"use client";

import {useEffect, useState} from "react";
import {extractSheetId} from "@/lib/sheets";
import Lottery from "@/components/Lottery";

const STORAGE_KEY = "lunch:sheetId";

type UIState = "hydrating" | "setup" | "connected";

export default function Home() {
    const [ui, setUi] = useState<UIState>("hydrating");
    const [sheetId, setSheetId] = useState<string>("");

    // 하이드레이션: ?sheet=... URL 파라미터(공유 링크)가 최우선,
    // 없으면 localStorage에서 복구.
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const fromUrl = params.get("sheet");
            if (fromUrl) {
                const id = extractSheetId(fromUrl) ?? fromUrl;
                try {
                    localStorage.setItem(STORAGE_KEY, id);
                } catch {
                    /* 저장 실패는 무시 */
                }
                // 새로고침 시 저장된 값을 쓰도록, 그리고 URL을 깔끔하게 유지하도록
                // 쿼리스트링을 제거.
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
            /* 시크릿 모드 등 localStorage 접근이 막힌 경우 무시 */
        }
        setUi("setup");
    }, []);

    const connect = (id: string) => {
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch {
            /* 저장 실패는 무시 */
        }
        setSheetId(id);
        setUi("connected");
    };

    const disconnect = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* 저장 실패는 무시 */
        }
        setSheetId("");
        setUi("setup");
    };

    if (ui === "hydrating") {
        return <main className="min-h-screen bg-slate-950"/>;
    }

    if (ui === "connected" && sheetId) {
        return <Lottery sheetId={sheetId} onDisconnect={disconnect}/>;
    }

    return <Setup onConnect={connect}/>;
}

function Setup({onConnect}: { onConnect: (sheetId: string) => void }) {
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
                                • 컬럼 구조: A 한/중/일식 / B 음식 대분류 / <strong>C 식당 이름</strong> / D 주 음식 / E 대략 위치 / F 위치 상세 / G
                                마지막 방문일 / H 마지막 방문일로부터
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
