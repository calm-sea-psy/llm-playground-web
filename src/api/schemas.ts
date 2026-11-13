// 서버 응답 검증 · 변환. 계약 모양 검증과 camelCase 변환은 생성 코드(generated/schemas.generated.ts)가 한다.
// 여기서는 화면이 계약보다 너그럽게 읽는 곳만 생성 스키마에서 고쳐 만든다:
// 값 목록(stage · code)에 모르는 값이 와도, 진단(diagnostics)의 모양이 바뀌어도 이미 받은 답을 버리지 않는다.

import { z } from "zod";

import {
  deltaEventRaw,
  doneEventRaw,
  errorEventRaw,
  healthResponseRaw,
  httpValidationErrorRaw,
  sourceRaw,
  sourcesEventRaw,
  stageEventRaw,
  toDeltaEvent,
  toHealthResponse,
  toHTTPValidationError,
  toSourcesEvent,
} from "./generated/schemas.generated";

/** 화면 형식 요청 → 서버 형식 본문 (POST /ask. mode 는 쿼리 파라미터라 본문에 넣지 않는다) */
export { toAskRequestBody as toAskBody } from "./generated/schemas.generated";

/** GET /health */
export const healthSchema = healthResponseRaw.transform(toHealthResponse);

/** 422 응답 본문 (FastAPI 요청 검증 오류) */
export const validationErrorSchema = httpValidationErrorRaw.transform(toHTTPValidationError);

/** stage 이벤트 data. 계약에 없는 단계도 받는다 (화면은 서버의 안내 문구를 그대로 보여 준다) */
export const stageEventSchema = stageEventRaw.extend({ stage: z.string() });

/** sources 이벤트 data */
export const sourcesEventSchema = sourcesEventRaw.transform(toSourcesEvent);

/**
 * 출처 하나 (화면이 저장해 둔 대화를 다시 읽을 때). 출처는 서버 형식과 화면 형식의 필드 이름이 같아 서버 검증 스키마를 그대로 쓴다.
 * 이름이 달라지면 쓰는 곳의 타입 표기(lib/history.ts 의 z.ZodType<Answer>)에서 컴파일 오류가 난다
 */
export const sourceSchema = sourceRaw;

/** delta 이벤트 data */
export const deltaEventSchema = deltaEventRaw.transform(toDeltaEvent);

/** done 이벤트 data 중 화면이 쓰는 것. 진단(diagnostics · stage_path)은 로그용이라 읽지 않는다 */
export const doneEventSchema = doneEventRaw
  .pick({ cited: true, truncated: true, timed_out: true, failed: true })
  .transform((raw) => ({
    cited: raw.cited,
    truncated: raw.truncated,
    timedOut: raw.timed_out,
    failed: raw.failed,
  }));

/** error 이벤트 data. 계약에 없는 코드도 받는다 (화면은 서버의 문구를 보여 주고, 코드는 로그에 남긴다) */
export const errorEventSchema = errorEventRaw.extend({ code: z.string() });
