// 서버 응답(HTTP 상태 + 본문, /ask 이벤트)을 화면 형식으로 읽는다.
// 본문은 JSON 으로 읽은 값이다. JSON 이 아니면(프록시 오류 페이지 · 빈 본문) undefined 를 넘긴다.

import type { z } from "zod";

import { RequestError, type RequestErrorCode } from "./client";
import {
  deltaEventSchema,
  doneEventSchema,
  errorEventSchema,
  healthSchema,
  sourcesEventSchema,
  stageEventSchema,
  validationErrorSchema,
} from "./schemas";
import type { AskEnd, AskProgress, HealthResponse } from "./types";

const HTTP_OK = 200;
const HTTP_UNPROCESSABLE = 422; // FastAPI 요청 검증 실패

/** 422 본문의 거절된 필드(loc 의 마지막) → 오류 코드. 목록에 없는 필드는 invalid_request */
const REJECTED_FIELD_CODES: Readonly<Partial<Record<string, RequestErrorCode>>> = {
  question: "invalid_question",
  mode: "invalid_mode",
};

/** 받은 HTTP 응답 */
export interface HttpResult {
  status: number;
  /** JSON 으로 읽은 본문. JSON 이 아니면 undefined */
  body: unknown;
}

/** /ask 이벤트 하나를 읽은 결과 */
export type AskEventResult =
  | { kind: "progress"; progress: AskProgress }
  | { kind: "end"; end: AskEnd }
  /** 계약에 없는 이벤트 이름. 건너뛴다 (wiki 가 이벤트를 더해도 답을 버리지 않는다) */
  | { kind: "unknown" };

/** 기대한 본문을 받지 못함: 본문이 없으면 서버에 닿지 못한 것(network), 다른 JSON 이면 계약 위반(bad_response) */
function unreachable(status: number, body: unknown, what: string): RequestError {
  return body === undefined
    ? new RequestError("network", `${what}을(를) 받지 못했습니다 (HTTP ${status}, 본문 없음)`)
    : new RequestError("bad_response", `${what} 응답이 계약과 다릅니다 (HTTP ${status})`);
}

/** 422 본문에서 거절된 필드를 찾아 오류 코드로 바꾼다 */
function rejected(body: unknown): RequestError {
  const parsed = validationErrorSchema.safeParse(body);
  const fields = parsed.success ? parsed.data.detail.map((d) => String(d.loc.at(-1))) : [];
  const code =
    fields
      .filter((field) => Object.hasOwn(REJECTED_FIELD_CODES, field))
      .map((field) => REJECTED_FIELD_CODES[field])
      .find((c) => c !== undefined) ?? "invalid_request";
  return new RequestError(code, `요청이 검증에서 거절되었습니다 (HTTP 422: ${fields.join(", ")})`);
}

/** data 를 스키마로 읽는다. 계약과 다르면 bad_response */
function parseData<T>(schema: z.ZodType<T>, data: unknown, event: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new RequestError("bad_response", `${event} 이벤트가 계약과 다릅니다`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * GET /health 응답을 읽는다.
 *
 * @throws RequestError 200 이 아니거나(network · bad_response) 형식이 계약과 다를 때(bad_response)
 */
export function readHealth({ status, body }: HttpResult): HealthResponse {
  if (status !== HTTP_OK) {
    throw unreachable(status, body, "서버 상태");
  }
  return parseData(healthSchema, body, "서버 상태");
}

/**
 * POST /ask 가 이벤트 스트림을 열지 않고 돌려준 응답(200 이 아닌 상태)을 오류로 바꾼다.
 *
 * @returns 422 면 거절된 필드별 코드, 그 밖은 서버에 닿지 못함(network · 본문 없음) 또는 계약 위반(bad_response)
 */
export function readAskRejection({ status, body }: HttpResult): RequestError {
  return status === HTTP_UNPROCESSABLE ? rejected(body) : unreachable(status, body, "답변");
}

/**
 * /ask 이벤트 하나를 읽는다.
 *
 * @param data 이벤트 data 를 JSON 으로 읽은 값 (JSON 이 아니면 undefined)
 * @throws RequestError data 가 계약과 다를 때 (bad_response)
 */
export function readAskEvent(event: string, data: unknown): AskEventResult {
  switch (event) {
    case "stage": {
      const { stage, message } = parseData(stageEventSchema, data, event);
      return { kind: "progress", progress: { event, stage, message } };
    }
    case "sources":
      return {
        kind: "progress",
        progress: { event, sources: parseData(sourcesEventSchema, data, event).sources },
      };
    case "delta":
      return {
        kind: "progress",
        progress: { event, text: parseData(deltaEventSchema, data, event).text },
      };
    case "done":
      return { kind: "end", end: { event, ...parseData(doneEventSchema, data, event) } };
    case "error": {
      const { code, message } = parseData(errorEventSchema, data, event);
      return { kind: "end", end: { event, code, message } };
    }
    default:
      return { kind: "unknown" };
  }
}
