# 점심 뽑기 🎰

Google Sheets에 적어둔 식당 목록으로 동료와 함께 **실시간** 룰렛을 돌리는 웹 앱.

- 한 명이 "뽑기"를 누르면 접속한 **모두의 화면에서 같은 슬롯머신이 같은 결과로** 멈춥니다.
- 식당 목록은 Google Sheets에서 바로 읽으므로 시트만 수정하면 앱에 즉시 반영돼요.
- **외부 서비스 0개** — Next.js 내부의 SSE + 인메모리 pub/sub으로 실시간 동기화 구현.
- Next.js 16 · Tailwind · Framer Motion.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

## Google Sheets 준비

앱에서 시트 URL을 입력하는 방식이라 코드 수정 불필요. 시트 조건만 맞추면 돼요.

- 공유 설정을 **"링크가 있는 모든 사용자 · 뷰어"** 로 변경 (API 키 없이 CSV export로 읽습니다).
- 스키마:
  - A열 음식 나라
  - B열 대분류
  - **C열 식당 이름 ← 추첨 대상**
  - D열 종류
  - E열 대략 위치
  - F열 위치 상세
  - G열 마지막 방문일
  - H열 마지막 방문일로부터

## 동료와 같이 쓰기

이 앱은 **같은 Next.js 프로세스에 붙은 사람끼리** 실시간 동기화됩니다. 즉, 호스트 PC에서 `npm run dev`를 띄우고, 동료는 그 서버에 접속해야 함.

### 방법 A — 같은 WiFi
```bash
npm run dev
# Network: http://192.168.x.x:3000  ← 이 주소를 동료에게 전달
```

### 방법 B — 외부에서도 접속 (터널)
사내망 밖에 있는 동료를 위해 ngrok 같은 터널 사용:
```bash
npx ngrok http 3000
# https://xxxx.ngrok-free.app 주소가 생김 — 이걸 공유
```

## 테스트

1. 한 브라우저에서 시트 URL 연결 → 추첨 화면 진입
2. **🔗 링크 공유** 버튼 → 다른 브라우저(또는 시크릿 창)에 붙여넣기
3. 우상단 배지가 `2명`으로 바뀌는지 확인
4. 한쪽에서 **🎰 점심 뽑기** 클릭 → **양쪽 화면에서 동시에** 룰렛이 돌고 같은 식당에서 정지

## 아키텍처 노트

실시간 싱크는 3개 파일이 담당:
- [`src/lib/broker.ts`](src/lib/broker.ts) — Node EventEmitter 기반 per-sheet 인메모리 pub/sub
- [`src/app/api/stream/route.ts`](src/app/api/stream/route.ts) — SSE(Server-Sent Events) 스트림
- [`src/app/api/draw/route.ts`](src/app/api/draw/route.ts) — 뽑기 이벤트 broadcast

서버가 단일 Node 프로세스라는 전제로 동작합니다. Vercel/Edge 같은 서버리스 환경에서는 동작하지 않아요 (각 요청이 다른 메모리 공간을 가지기 때문).
