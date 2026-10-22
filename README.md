# llm-playground-web

여러 LLM 프로젝트에 공통으로 붙여 쓰는 채팅형 프론트엔드입니다. 팀 프로젝트 [Seal_LLM](https://github.com/theSealLLM/Seal_LLM)의 화면(Seal_Frontend)으로 시작했으며, 지금은 Seal_LLM API 형식에 맞춰져 있습니다. 문의를 입력하면 분류 결과와 함께 답변이 스트리밍되고, 답변을 바로 복사해 쓸 수 있습니다.

React 19 · Vite 8 · TypeScript · Tailwind CSS v4

## 주요 기능

- **스트리밍 답변** — 단계 표시(분류 중 · 답변 작성 중 · 범위 밖 문의 처리 중 + 경과 시간), 일정한 속도의 타이핑 효과와 커서
- **마크다운 답변** — 굵게 · 목록 · 표. 타이핑 중에도 `**` 같은 기호가 보이지 않게 처리. 원시 HTML은 그리지 않음
- **답변 복사** — 서식 있는 글(HTML)과 평문을 함께 클립보드에 넣음 (붙여 넣는 곳에 맞게)
- **처리 과정 보기** — 라벨 · 경로 · LLM 검증 배지, 펼치면 분류기 확률 · 경로 규칙 · 툴 호출 · 토큰 · 전체 시간
- **문의 내역** — 브라우저(localStorage)에 저장, 날짜별 묶음, 삭제 뒤 5초 실행 취소. 답변을 받는 도중 다른 대화로 옮겨도 원래 대화에서 계속 받음
- **입력창** — 자동 높이, Enter 전송 · Shift+Enter 줄바꿈, 한글 입력(IME) 중 Enter 무시, 전송 중에는 중지 버튼
- **자동 스크롤** — 바닥을 따라가다가 사용자가 위로 올리면 멈추고 "↓ 맨 아래로"
- 오류별 안내와 다시 시도 · 다시 생성 · 서버 상태 표시 · 시스템/라이트/다크 테마 · 좁은 화면 메뉴 · 스크린 리더 지원

## 준비

- Node.js 24 이상 (개발: 24.19)
- (실제 서버에 붙일 때만) 실행 중인 Seal_LLM API (기본 `http://127.0.0.1:8000`)

```bash
npm install
```

## 실행

기본은 **목업 모드**입니다. 서버 없이 화면 개발 서버만 띄우고 http://localhost:5173 을 엽니다.

```bash
npm run dev
```

목업([src/api/mockClient.ts](src/api/mockClient.ts))은 실제 서버와 같은 순서로 이벤트를 흘립니다.

| 문의 내용                                       | 흐름                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| "배송" · "환불" · "반품" · "계정" · "로그인" 등 | 해당 라벨로 분류 → 답변을 조각으로 흘림                       |
| 그 밖                                           | 범위 밖(adventure): 3초 기다린 뒤 툴 호출 기록과 함께 한 번에 |
| "오류"가 들어 있음                              | `done(status="error", llm_error)`                             |

## 실제 서버에 붙이기

`.env.local`에 `VITE_API_MODE=http`를 넣고 Seal_LLM API 서버를 띄운 뒤 개발 서버를 다시 시작합니다. Seal_LLM 폴더에서:

```bash
uv run uvicorn --app-dir src theseal.api.main:app --reload --port 8000
```

사이드바 아래에 "● 서버 정상"이 보이면 연결된 것입니다. API 서버가 꺼져 있으면 "연결 안 됨"으로 표시되고, 서버가 올라오면 30초 안에 자동으로 바뀝니다.

| 상황                        | 방법                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 개발 서버(`npm run dev`)    | 설정 없이 Vite 프록시가 `/api` · `/health`를 `http://127.0.0.1:8000`으로 넘긴다 ([vite.config.ts](vite.config.ts)) |
| API를 다른 주소에서 띄울 때 | `.env.local`에 `VITE_API_BASE=http://주소:포트` (끝의 `/`는 빼도 됨)                                               |

서버 응답(snake_case)은 [src/api/schemas.ts](src/api/schemas.ts)가 zod로 검증하고 화면 형식(camelCase)으로 바꿉니다. 서버 응답 형식이 바뀌면 이 파일만 고칩니다.

- 프록시 대상을 `localhost`가 아니라 `127.0.0.1`로 둔 이유: Windows에서 `localhost`는 IPv6를 먼저 시도해 요청마다 약 2초 늦어진다.
- `VITE_API_BASE`로 API를 직접 부르면 브라우저가 CORS를 확인한다. Seal_LLM은 `.env`의 `API_CORS_ORIGINS`(쉼표로 구분)에 있는 주소만 허용하며, 기본값은 `localhost` · `127.0.0.1`의 5173 · 3000번 포트다. **`npm run preview`(4173번)나 배포 주소에서 쓰려면 그 주소를 `API_CORS_ORIGINS`에 추가**해야 한다.

## 스크립트

| 명령                 | 하는 일                                  |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | 개발 서버 (5173)                         |
| `npm run build`      | 타입 검사 후 `dist/`에 빌드              |
| `npm run preview`    | 빌드 결과 미리보기 (4173, 위 CORS 참고)  |
| `npm test`           | 테스트 한 번 실행 (Vitest)               |
| `npm run test:watch` | 파일이 바뀔 때마다 테스트                |
| `npm run lint`       | 린트 (ESLint). `lint:fix`는 자동 수정    |
| `npm run format`     | 포맷 (Prettier). `format:check`는 검사만 |
| `npm run typecheck`  | 타입 검사 (`tsc -b`)                     |

테스트는 API 계층은 Node 환경, 화면은 jsdom 환경에서 돈다(파일 첫 줄 `// @vitest-environment jsdom`). jsdom 준비 때문에 전체 실행에 약 20초가 걸린다.

## 폴더 구조

```
src/
├── api/
│   ├── client.ts        # 화면이 쓰는 API 계약 (ApiClient) · AnswerStreamError
│   ├── httpClient.ts    # 실제 서버: /health, /api/answer/stream (fetch + SSE, 중지)
│   ├── mockClient.ts    # 목업: 서버 없이 같은 이벤트 흐름
│   ├── schemas.ts       # 서버 응답 검증 · snake_case → camelCase 변환 (zod)
│   ├── sse.ts           # SSE 파서 (바이트 조각 → 이벤트)
│   └── types.ts         # 화면 안의 API 데이터 형식
├── providers/           # ApiProvider (클라이언트 주입) · TypewriterMemoryProvider
├── hooks/
│   ├── useApi.ts        # ApiProvider 가 끼운 클라이언트
├── hooks/
│   ├── useChat.ts       # 대화 목록 · 전송 · 중지 · 다시 시도 · 다시 생성 · 삭제
│   ├── useHealth.ts     # 서버 상태 주기 확인
│   ├── useTypewriter.ts # 타이핑 효과
│   ├── useAutoScroll.ts # 자동 스크롤 + 사용자 개입 감지
│   ├── useDrawer.ts     # 좁은 화면 사이드바 덮개
│   └── useTheme.ts …    # 테마 · 미디어 쿼리 · 움직임 줄이기 · 현재 시각 · 스크린 리더 알림
├── lib/
│   ├── config.ts        # 설정값 (API 주소, 타이핑 속도, 스크롤 거리 등)
│   ├── labels.ts        # 화면 표시 이름 (라벨 · 경로 · 툴 · 오류 안내)
│   ├── history.ts       # 문의 내역 저장 · 불러오기 (v2, v1 저장본은 자동 변환)
│   ├── markdown.ts      # 타이핑 중 서식 닫기 · 복사용 평문/HTML
│   └── chat.ts · clipboard.ts
├── components/          # Sidebar, ChatView, Composer, Markdown, MessageMeta, messages/ …
├── test/                # 테스트용 가짜 API 클라이언트 · Provider 래퍼
├── App.tsx
└── main.tsx             # API 클라이언트를 만들어 Provider 로 끼운다 (VITE_API_MODE)
```

## 알아 둘 점

- **API는 문의를 하나씩 따로 처리한다.** 같은 대화에서 다시 보내도 이전 문의 내용은 이어지지 않는다(입력창 아래에 안내). 요청도 한 번에 하나만 보낸다.
- **문의 내역은 이 브라우저에만 저장된다.** 저장 API가 없어 다른 기기 · 브라우저와 공유되지 않으며, 최신 200개까지 보관한다. 저장할 수 없는 환경(시크릿 창 등)에서도 화면은 동작한다.
- 화면이 숨겨지면(다른 탭 · 최소화) 브라우저가 애니메이션을 멈춰 타이핑 표시도 멈춘다. 답변은 계속 받고 있으며, 돌아오면 약 0.6초 안에 따라잡는다.
- 범위 밖 문의(날짜 · 날씨 · 검색)는 툴을 쓴 뒤 답이 한 번에 오므로 수십 초 걸릴 수 있다. 그동안 경과 시간을 보여 준다.

## 문서

- [FRONTEND_PLAN.md](FRONTEND_PLAN.md) — 작업 계획, 연결하는 API 명세, 단계별 결정과 구현 메모(실측 · 찾아서 고친 결함 포함)
