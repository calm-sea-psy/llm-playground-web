// 화면 안에서 쓰는 API 데이터 형식 (camelCase).
// 계약 모양(타입 · 값 목록 · 요청 제약 · 설명)은 contracts/openapi.json 에서 생성한 generated/schemas.generated.ts 가 원본이다
// (npm run gen:api. 계약에 없는 설명은 scripts/schema-descriptions.mjs). 여기에는 화면 쪽 이름과 약속만 둔다.

import type {
  AskMode,
  AskRequestInput,
  DoneEvent,
  ErrorEvent,
  Source,
  StageEvent,
} from "./generated/schemas.generated";

export {
  ASK_MODE_DEFAULT,
  ASK_MODES,
  ASK_REQUEST_QUESTION_MAX_LENGTH,
} from "./generated/schemas.generated";
export type { AskMode, HealthResponse, Source } from "./generated/schemas.generated";

/** 계약에 있는 단계 이름 (stage 이벤트). 서버가 더한 단계도 받으려고 AskProgress 의 stage 는 string 으로 둔다 */
export type StageName = StageEvent["stage"];

/** 계약에 있는 오류 코드 (error 이벤트). 서버가 더한 코드도 받으려고 AskEnd 의 code 는 string 으로 둔다 */
export type ErrorEventCode = ErrorEvent["code"];

/** POST /ask 요청. mode 는 쿼리 파라미터(?mode=)로 보낸다. 계약에서는 선택이지만 화면은 항상 보낸다 */
export interface AskRequest extends AskRequestInput {
  mode: AskMode;
}

/**
 * /ask 의 진행 이벤트 (끝 이벤트 done · error 전에 오는 것).
 * stage 는 계약에 없는 단계 이름일 수 있다 (wiki 가 단계를 더해도 답을 버리지 않는다). 화면은 message 를 보여 준다
 */
export type AskProgress =
  | { event: "stage"; stage: string; message: string }
  | { event: "sources"; sources: Source[] }
  | { event: "delta"; text: string };

/**
 * /ask 의 끝 이벤트. 스트림에 한 번만, 마지막에 온다.
 * - done: 답을 다 보냈다. 잘렸으면 truncated · timedOut · failed 가 참이다
 * - error: 답 조각을 하나도 못 보낸 채 실패했다. code 는 계약에 없는 값일 수 있고, message 는 화면에 띄울 문구다
 */
export type AskEnd =
  | ({ event: "done" } & Pick<DoneEvent, "cited" | "truncated" | "timedOut" | "failed">)
  | { event: "error"; code: string; message: string };
