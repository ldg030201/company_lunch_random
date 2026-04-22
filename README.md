# 점심 뽑기 🎰

Google Sheets에 정리해둔 식당 목록을 동료들과 **실시간으로 공유**하며 룰렛을 돌리는 웹 앱.

- 한 명이 뽑기 버튼을 누르면 접속한 **모두의 화면에서 같은 슬롯머신이 같은 결과로** 멈춥니다.
- 버튼을 **연타**하면 릴이 더 빠르게 돌아가고, 클릭을 멈추면 자동으로 감속 → 당첨자 확정.
- **외부 서비스 0개** — Next.js 내부의 SSE + 인메모리 pub/sub으로 실시간 동기화 구현.
- Google Sheets를 그대로 데이터 소스로 사용 (API Key 불필요, 공개 CSV export 방식).
- Next.js 16 · TypeScript · Tailwind v4 · Framer Motion.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

환경변수나 외부 서비스 가입 절차 없음. 바로 시작됩니다.

## Google Sheets 준비

앱 화면에서 시트 URL만 붙여넣으면 자동 연결돼요. 시트만 아래 조건을 만족하면 됩니다.

### 공유 설정

우상단 **공유** → "링크가 있는 모든 사용자 · 뷰어"로 변경.
(API 키 없이 `gviz/tq?tqx=out:csv`로 읽기 때문에 필수)

### 컬럼 구조

| 열     | 내용         | 앱에서 쓰임                         |
|-------|------------|--------------------------------|
| A     | 한/중/일식     | 필터 (다중 선택)                     |
| B     | 음식 대분류     | 필터 (다중 선택)                     |
| **C** | **식당 이름**  | **추첨 대상**                      |
| D     | 주 음식       | 필터 (다중 선택)                     |
| E     | 대략 위치      | 필터 + 결과 카드 표시                  |
| F     | 위치 상세      | 결과 카드에서 카카오맵 링크 구성에 사용         |
| G     | 마지막 방문일    | 결과 카드 표시                       |
| H     | 마지막 방문일로부터 | 필터 ("N일 이상 안 간 곳만") + 결과 카드 표시 |

1행은 헤더로 간주되어 자동으로 건너뜁니다. 컬럼 레이블은 자유롭게 바꿔도 되지만, **C열이 식당 이름**이어야 정상 동작합니다.

## 화면 구성

### 첫 방문 — 시트 연결

- URL 입력 → localStorage(`lunch:sheetId`)에 저장
- 다음 방문부터는 자동으로 추첨 화면으로 이동
- 좌상단 **← 시트 연동 해제** 버튼으로 초기화 가능

### 추첨 화면 헤더

```
← 시트 연동 해제    🟢 N명 접속   🔄 동기화   🔗 링크 공유
```

| 버튼       | 동작                                                          |
|----------|-------------------------------------------------------------|
| 🔄 동기화   | Google Sheets를 강제 재조회 (`?fresh=1`). 시트에 식당 추가한 뒤 누르면 즉시 반영. |
| 🔗 링크 공유 | `?sheet=<ID>` 쿼리 포함 URL 복사. 공유받은 사람은 클릭 한 번으로 자동 연결.        |
| 🟢 N명    | 같은 시트에 현재 접속 중인 사람 수 (Server Presence).                     |

### 필터

접는 패널. 선택한 칩들 AND 조건으로 당첨 대상 좁힘. "N일 이상 안 간 곳만" 숫자 입력도 지원.

### 뽑기 버튼 (🎰 뽑기 / 연타!)

- **연타 가능**. 한 번 누르면 시작되고, 그 이후 클릭마다 릴 속도가 가속됨.
- 1.2초 동안 클릭이 없으면 자동 감속 → 당첨자에 딱 정지 (바운스 + 컨페티).
- 많이 누를수록 감속 시간도 길어짐 (base 2.2s + 0.1s × 부스트 횟수, 최대 5.5s).

## 동료와 같이 쓰기

이 앱은 **같은 Next.js 프로세스에 붙은 사람끼리** 실시간 동기화됩니다. 호스트 PC에서 `npm run dev`를 띄우고, 동료는 그 서버에 접속.

### 방법 A — 같은 WiFi

```bash
npm run dev
# ▲ Next.js 16.x.x
#   - Local:   http://localhost:3000
#   - Network: http://192.168.0.13:3000   ← 이 주소 공유
```

Next.js 16부터 `/_next/*` 자산에 기본적으로 cross-origin 차단이 있어서 [next.config.ts](next.config.ts)의 `allowedDevOrigins`에 사설 IP 대역(
`192.168.0.*`, `10.*.*.*` 등)을 미리 넣어뒀습니다. 필요하면 추가하세요.

### 방법 B — 외부에서도 접속 (터널)

사내망 밖에 있는 동료를 위해:

```bash
npx ngrok http 3000
# https://xxxx.ngrok-free.app 주소가 생김 — 이걸 공유
```

## 테스트 시나리오

### 단독 테스트

1. 시트 연결 → 추첨 화면 진입
2. 뽑기 버튼 1회 클릭 → 포인터가 내려오고 릴 회전
3. 빠르게 3~5회 추가 클릭 → 릴이 점점 빨라짐
4. 클릭 멈춤 → 1.2초 후 감속 → 당첨자 확정 + 컨페티

### 멀티 클라이언트

1. 탭 A에서 시트 연결 → 🔗 링크 공유 → 탭 B에 붙여넣기
2. 헤더 배지가 `2명`으로 바뀜
3. 어느 쪽에서든 클릭 → 양쪽 릴이 동시에 같은 방향/속도로 돌아감
4. 양쪽 다 클릭 가능 — 부스트 기여함
5. 양쪽 모두 같은 당첨자에서 정지 (같은 `startAt` 타임스탬프로 싱크)

### 시트 업데이트 후 반영

1. Google Sheets에서 식당 추가
2. 앱에서 **🔄 동기화** 클릭 → "동기화 중" → "최신!"
3. 필터 패널의 칩 목록과 추첨 대상이 갱신됨

## 아키텍처

```
┌──────────────────┐       ┌───────────────────────┐       ┌──────────────────┐
│  Google Sheets   │  ◀──  │  Next.js (단일 Node)  │  ◀──▶ │   브라우저들     │
│  (CSV export)    │       │  • /api/restaurants   │       │   EventSource +  │
└──────────────────┘       │  • /api/draw (POST)   │       │   POST           │
                           │  • /api/stream (SSE)  │       └──────────────────┘
                           │  • 인메모리 broker    │
                           │  • 세션 매니저        │
                           └───────────────────────┘
```

### 핵심 파일

| 파일                                                                   | 역할                                                           |
|----------------------------------------------------------------------|--------------------------------------------------------------|
| [src/lib/sheets.ts](src/lib/sheets.ts)                               | Google Sheets CSV 파싱 + `fresh` 옵션으로 캐시 우회                    |
| [src/lib/broker.ts](src/lib/broker.ts)                               | 시트(방)별 Node EventEmitter 기반 pub/sub + presence 카운트           |
| [src/lib/spin-session.ts](src/lib/spin-session.ts)                   | 시트별 활성 스핀 세션 관리 (첫 클릭 → 세션, 이후 클릭 → 부스트, 아이들 타이머로 자동 settle) |
| [src/app/api/restaurants/route.ts](src/app/api/restaurants/route.ts) | 시트 읽기 엔드포인트. `?fresh=1` 시 캐시 우회                              |
| [src/app/api/draw/route.ts](src/app/api/draw/route.ts)               | 클릭 접수 → `spin-session.handleClick` 위임                        |
| [src/app/api/stream/route.ts](src/app/api/stream/route.ts)           | SSE 스트림 (keep-alive ping 포함)                                 |
| [src/components/SlotMachine.tsx](src/components/SlotMachine.tsx)     | RAF 기반 자유 스핀 + settle 2단 애니메이션(overshoot + spring) + 포인터     |
| [src/components/Lottery.tsx](src/components/Lottery.tsx)             | 추첨 화면 전반. SSE 구독, 클릭 POST, 결과 카드                             |
| [src/components/Filters.tsx](src/components/Filters.tsx)             | 다중 선택 칩 필터 패널                                                |

### SSE 이벤트 프로토콜

서버가 `/api/stream?sheetId=...`로 브로드캐스트하는 이벤트:

```ts
type BrokerEvent =
    | { type: "presence"; count: number }
    | { type: "spin:start"; sessionId: string; startAt: number }
    | { type: "spin:boost"; sessionId: string; boostAt: number; boostCount: number }
    | { type: "spin:settle"; sessionId: string; winnerIndex: number; startAt: number; durationMs: number };
```

| 이벤트           | 발생 조건                                   |
|---------------|-----------------------------------------|
| `spin:start`  | 세션 없거나 settled 상태에서 누군가 클릭 → 새 세션       |
| `spin:boost`  | 이미 active 세션에서 누군가 클릭 → 속도 부스트          |
| `spin:settle` | 1.2초 동안 클릭 없거나 20초 최대 세션 시간 초과 → 당첨자 확정 |

### 제약

서버가 **단일 Node 프로세스**라는 전제로 동작합니다. Vercel Edge/Serverless 같은 환경에서는 매 요청이 독립 메모리라 broker가 제 기능을 못 해요. 로컬 개발 + 자체 호스팅(
Railway/Render/Docker 등) 상시 가동 서버에 적합.

## 개발 메모

### 주석 스타일

- 모든 주석은 한국어.
- "WHY" 중심 — 코드가 뭘 하는지가 아니라 **왜** 그렇게 하는지.

### 자주 쓰는 명령

```bash
npm run dev      # dev 서버 시작
npm run build    # 타입/빌드 검증
npm run lint     # ESLint
```
