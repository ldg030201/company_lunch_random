# 점심 뽑기 🎰

Google Sheets에 적어둔 식당 목록으로 동료와 함께 **실시간** 룰렛을 돌리는 웹 앱.

- 한 명이 "뽑기"를 누르면 접속한 **모두의 화면에서 같은 슬롯머신이 같은 결과로** 멈춥니다.
- 식당 목록은 Google Sheets에서 바로 읽으므로 시트만 수정하면 앱에 즉시 반영돼요.
- Next.js 15 · Tailwind · Framer Motion · Supabase Realtime.

## 셋업

### 1. Google Sheets 준비
- 사용할 시트 ID를 [`src/lib/sheets.ts`](src/lib/sheets.ts)의 `DEFAULT_SHEET_ID`에 지정합니다.
- 공유 설정을 **"링크가 있는 모든 사용자 · 뷰어"** 로 변경 (API 키 없이 CSV export로 읽습니다).
- 스키마: A열 음식 나라 / B열 대분류 / **C열 식당 이름 ← 추첨 대상** / D~ 기타.

### 2. Supabase Realtime (선택, 실시간 동기화용)
1. [supabase.com](https://app.supabase.com) → 새 프로젝트 생성 (DB 설정 기본값)
2. Project Settings → API → `URL`과 `anon key` 복사
3. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 입력

> Supabase 없이도 동작하지만, 다른 사람과 같은 결과를 동시에 보는 기능은 꺼집니다.

### 4. 실행
```bash
cp .env.example .env.local   # 값을 채워주세요
npm install
npm run dev                   # http://localhost:3000
```

## 테스트

1. 브라우저 창 **2개** 열기 (일반 창 + 시크릿 창)
2. 첫 창에서 방 만들고 URL 복사 → 시크릿 창에 붙여넣기
3. 우상단에 `2명 접속` 표시 확인
4. 한쪽에서 **🎰 점심 뽑기** 클릭 → 양쪽 화면에서 동시에 룰렛이 돌고 같은 식당에서 정지하는지 확인

## 배포

```bash
npx vercel             # Vercel 계정으로 로그인 후 배포
```

Vercel 대시보드 → Project Settings → Environment Variables에서 위 환경변수 3개를 추가하세요.
