# 프론트엔드 기능 목록 (llm-playground-web 재활용)

- 담당: 필수 (프론트엔드)
- 기반: calm-sea-psy/llm-playground-web `dev` 브랜치 (React 19 · Vite 8 · TS · Tailwind v4, Seal_LLM API 기준)
- 발제 전제: 별도 사용자 화면은 선택. 시연은 Swagger로도 가능 → 프론트의 "필수"는 **팀 시연·비교를 화면으로 하기 위한 최소 조건**

## 0. 먼저 백엔드와 합의할 것 (계약 → 목업 → 구현 순서)

`/query` 요청·응답 스키마를 1일차에 고정하고 `schemas.ts`(zod) + `mockClient.ts`에 먼저 반영. 발제 예시 기준 제안:

```ts
// 요청
{ question: string; retrieval_mode: "naive" | "hybrid" | "hybrid_rerank" }

// 응답
{
  request_id: string;
  status: "answered" | "needs_clarification" | "abstained" | "error";
  retrieval_mode: string;
  answer: string;            // [결론] 또는 확인 질문 / 보류 사유
  reason: string;            // [근거]
  citations: { source_id: string; book_id: string; file_name: string; page: number }[];  // [출처]
  retrieved?: { source_id: string; book_id: string; page: number; text: string; score?: number }[]; // 최종 문맥 (디버그)
  latency_ms: number | null;
  usage: { input_tokens: number | null; output_tokens: number | null };
  error: { code: string; message: string } | null;
  langfuse_trace_url?: string;
}
```

- 스트리밍 여부(JSON 단건 vs SSE) — 백엔드 결정에 따라 httpClient 경로 선택
- HTTP 상태: 빈 질문·잘못된 retrieval_mode는 4xx JSON, 그 외는 200 + status
- retrieved 포함 여부 (화면의 "검색 결과 보기"에 필요)

## 1. 필수 기능

| #   | 기능                                                                                             | 발제 근거                                        | 기존 코드                                           |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| F1  | `/query` 호출 + 요청/응답 zod 검증                                                               | 과제 3 FastAPI 연결                              | `httpClient.ts` 재작성(SSE→JSON), `schemas.ts` 교체 |
| F2  | 검색 방식 선택 (naive / hybrid / hybrid_rerank)                                                  | 과제 2 "하나의 서비스에서 검색 방식을 바꿔 실행" | `ProviderSelect` → `RetrievalModeSelect`            |
| F3  | 상태 4종 구분 표시 — answered / needs_clarification / abstained / error 를 색·아이콘·문구로 구분 | STEP 5 응답 형식                                 | `StatusMessage`·`ErrorMessage` 확장                 |
| F4  | 답변 카드 = [결론] answer → [근거] reason → [출처] citations 고정 레이아웃                       | 팀 결정 답변 형식                                | `AssistantMessage` 재구성                           |
| F5  | 출처 표시 "IS12.pdf 9쪽" 형태, 여러 건 목록                                                      | 과제 1 "문서명과 페이지 표시"                    | 신규 `Citations`                                    |
| F6  | needs_clarification 시 확인 질문 표시 + 원 질문을 입력창에 되채워 보완 후 재전송 (메모리 없음)   | STEP 5 "사용자가 질문을 보완해 다시 보내도록"    | `Composer` prefill                                  |
| F7  | abstained 시 보류 사유와 "확보할 자료" 안내를 오류와 다른 톤으로 표시                            | 과제 1 보류 처리                                 | F3                                                  |
| F8  | error 시 코드별 안내(model_timeout 등) + 다시 시도. 비밀값 노출 금지                             | STEP 5 오류 확인                                 | `ERROR_GUIDES` 교체                                 |
| F9  | request_id 표시 + 복사 (Langfuse 조회용)                                                         | 과제 3 "같은 요청 ID로 묶어 기록"                | `MessageMeta`                                       |
| F10 | 응답 시간·입출력 토큰 배지                                                                       | 과제 4 운영 지표                                 | `MessageMeta` (이미 있음)                           |
| F11 | `/health` 서버 상태                                                                              | 기존                                             | `useHealth` 그대로                                  |
| F12 | 목업 모드 — 4개 status 모두 재현 (백엔드 없이 개발·시연 리허설)                                  | 워크플로 문서 "목업 먼저"                        | `mockClient.ts` 교체                                |
| F13 | 요청 내역 localStorage 저장 (retrieval_mode 포함)                                                | 기존                                             | `history.ts` v3 마이그레이션                        |

## 2. 있으면 좋은 기능 (발표 효과 순)

| #   | 기능                                                                                                      | 효과                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| G1  | **3방식 나란히 비교 뷰** — 질문 하나로 naive/hybrid/rerank 동시 호출, 결론·출처·시간·토큰을 3열로         | 과제 2 비교를 화면 한 장으로 시연. 발표 핵심 장면        |
| G2  | **검색 결과(최종 문맥) 펼쳐 보기** — S1~Sk 청크의 문서·페이지·본문·점수                                   | "검색됐다 ≠ 답할 수 있다" 설명, 정정 공지 누락 원인 시연 |
| G3  | Langfuse trace 링크 버튼                                                                                  | 과제 3 실행 기록 확인을 클릭 한 번으로                   |
| G4  | 예시 질문 패널 — 평가셋에서 유형별 대표 질문(answer/clarify/abstain/계산) 클릭 → 입력창 채움              | 시연 흐름 고정, 타이핑 시간 절약                         |
| G5  | 평가 결과 대시보드 — 비교표 JSON(Hit@k·Recall@k·Faithfulness·Judge 4항목·시간·토큰·오류율) 로드해 표·차트 | 과제 4 결과 설명 페이지. 발표자료 대체 가능              |
| G6  | 출처 클릭 → PDF 해당 페이지 열기 (백엔드가 `documents/` 정적 서빙 시 `IS12.pdf#page=9`)                   | 근거 원문 대조 시연                                      |
| G7  | 보안 데모 토글 — 기본/방어 프롬프트 선택(백엔드 파라미터 필요), 공격 문장 노출 여부 표시                  | STEP 7 보안 답변 4개 시연                                |
| G8  | 산식 표시 — 계산 답변의 날짜·일수·요율·감액·금액을 표로 정리 (LLM이 구조화 출력 시)                       | 보관료 계산 문항 가독성                                  |
| G9  | 스트리밍 답변 (백엔드 SSE 지원 시)                                                                        | 기존 typewriter·SSE 파서 재사용                          |
| G10 | 짧은 후속 답변 이어받기 (대화 메모리)                                                                     | 발제 선택 기능. 백엔드 메모리 필요                       |
| G11 | 내역 내보내기 JSON/CSV (request_id·mode·status·시간·토큰)                                                 | 비교표 작성 보조                                         |
| G12 | 다크·좁은 화면·접근성                                                                                     | 기존 그대로                                              |

## 3. 기존 코드 처리

| 구분   | 대상                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 그대로 | `ApiProvider`/`ApiClient` 패턴, `Composer`(IME·자동 높이), `HistoryList`·`useUndoDelete`, `useHealth`·`ServerStatus`, `ThemeSelect`·`SidebarDrawer`, `Markdown`·`CopyButton`, `ErrorBoundary`, 테스트 구성(Vitest·MSW) |
| 교체   | `api/types.ts`·`schemas.ts`·`httpClient.ts`·`mockClient.ts`, `lib/labels.ts`, `MessageMeta`(분류·툴 → 출처·문맥·토큰·request_id), `ProviderSelect` → `RetrievalModeSelect`                                             |
| 보류   | `useTypewriter`·`sse.ts` (SSE 안 쓰면 미사용. 삭제하지 말고 남김), 분류 배지·tools_used 표시                                                                                                                           |
| 삭제   | Seal_LLM 전용 라벨(shipping/refund/account), adventure 단계                                                                                                                                                            |

## 4. 합의·결정 필요

- 프론트 코드 위치: 팀 모노레포 `web/` vs 별도 레포 (워크플로 문서는 Python uv workspace 기준이라 JS는 별도 디렉터리가 자연스러움)
- 스트리밍 여부
- `retrieved`(최종 문맥) 응답 포함 여부 — G2 전제
- PDF 정적 서빙 여부 — G6 전제
- 보안 데모용 프롬프트 선택 파라미터 — G7 전제
- CORS: 배포/preview 주소를 백엔드 허용 목록에 추가 (기존 README 참고)

## 5. 구조 작업 (구현 예정)

`common/` 같은 포괄 폴더는 만들지 않는다. 지금도 역할별로 나뉘어 있다(인터페이스 · 계약 타입은 `api/`, 순수 함수는 `lib/`, 공통 훅은 `hooks/`, 공통 UI는 `components/`). 대신 아래 두 가지를 한다.

### S1. 계약 자리 분리 — `contracts/openapi.json` 을 받으면

팀 계약(`packages/common` → `contracts/openapi.json`)은 "TS 타입은 openapi.json 에서 생성, 손으로 따로 쓰지 않는다"가 원칙이다. 지금은 파일이 없어 `src/api/types.ts` 를 계약 뷰어대로 손으로 옮겨 두었다.

- 전제: 팀 저장소의 `contracts/openapi.json` · `contracts/examples/*.json` 을 받는다
- 할 일
  1. `openapi-typescript` 를 devDependency 로 넣고 `npm run gen:api` 스크립트 추가 → `src/api/generated/openapi.d.ts` 생성
  2. `src/api/generated/` 는 생성물: 손으로 고치지 않고 ESLint · Prettier 대상에서 뺀다
  3. `schemas.ts` 의 zod 스키마를 생성 타입과 묶는다 (서버 형식 입력 = 생성 타입). 계약이 바뀌어 다시 생성하면 어긋난 곳이 타입 검사에서 걸리게 한다. 계약 불변식 검사(`superRefine`)는 그대로 둔다 — openapi.json 에는 불변식이 나오지 않는다
  4. `types.ts` 는 화면 형식(camelCase)만 남기고, 손으로 쓴 서버 형식 타입(`QueryBody` 등)은 생성 타입으로 바꾼다
  5. 목업 · 테스트가 `contracts/examples/*.json` 을 그대로 읽게 하고 손으로 옮긴 `src/test/contractExamples.ts` 를 지운다 (JSON import 에 `resolveJsonModule` 이 필요할 수 있다)
- 백엔드에 요청: `/query` 라우트에 오류 응답(`error_code` 별 503 · 502 · 504 · 500 → `QueryResponse`)을 `responses=` 로 선언해 달라. 선언하지 않으면 openapi.json 에는 200 · 422 만 나온다
- 완료 기준: `npm run gen:api` → 타입 검사 · 테스트 통과. 계약 필드 하나를 바꿔 다시 생성하면 `schemas.ts` 에서 타입 오류가 나는 것을 확인

### S2. 기능 폴더(`features/`)로 나누기 — 두 번째 기능을 시작할 때

기능이 하나인 지금 나누면 폴더만 늘어난다. G1(3방식 비교 뷰)이나 G5(평가 대시보드)를 만들기 시작할 때 한다.

- 목표 구조

  ```
  src/features/qa/        질문 · 답변 화면: useChat · useChatHistory · useUndoDelete · chat 모델 · history 저장 ·
                          ChatView · Composer · messages/ · AnswerCard · Citations · MessageMeta · RetrievalModeSelect
  src/features/compare/   새 기능 (예: G1)
  src/api · lib · hooks · components · providers   → 여러 기능이 같이 쓰는 공통 영역
  ```

- `lib/` 정리: 도메인 파일(`chat.ts` · `history.ts`, `labels.ts` 의 오류 안내 · 검색 방식 이름)은 `features/qa/` 로, 범용 파일(`storage` · `logger` · `clipboard` · `markdown` · `config`)은 `lib/` 에 남긴다
- 규칙: 다른 기능은 `features/<이름>/index.ts` 로만 import 한다 (내부 파일 직접 import 금지). 이때 `@/` 절대 경로 alias(vite · tsconfig)를 함께 들인다
- 완료 기준: 화면 동작 변화 없음(테스트 그대로 통과), 기능끼리 내부 파일을 직접 import 하지 않음
