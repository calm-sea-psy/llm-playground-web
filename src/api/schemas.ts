// 서버 형식(snake_case) 검증 · 변환. 서버 형식이 바뀌면 이 파일만 고친다.
// 원본 계약: packages/common/src/common/{types,api}.py — 필드 · 기본값 · 불변식을 그대로 옮겼다.

import { z } from "zod";

import {
  ANSWER_STATUSES,
  ERROR_CODES,
  RETRIEVAL_MODES,
  type HealthResponse,
  type QueryRequest,
  type QueryResponse,
  type RetrievalMode,
} from "./types";

/** POST /query 요청 본문 (서버 형식) */
export interface QueryBody {
  question: string;
  retrieval_mode: RetrievalMode;
  session_id: string;
}

/** GET /health */
export const healthSchema = z
  .object({
    status: z.literal("ok").default("ok"),
    index_ready: z.boolean(),
    index_name: z.string().nullish(),
    embedder_id: z.string().nullish(),
    supported_modes: z.array(z.enum(RETRIEVAL_MODES)).default([]),
  })
  .transform((raw): HealthResponse => ({
    status: raw.status,
    indexReady: raw.index_ready,
    indexName: raw.index_name ?? null,
    embedderId: raw.embedder_id ?? null,
    supportedModes: raw.supported_modes,
  }));

const citationSchema = z.object({
  source_id: z.string(),
  book_id: z.string(),
  file_name: z.string(),
  page: z.number().int().min(1),
});

const queryMetaSchema = z.object({
  retrieval_mode: z.enum(RETRIEVAL_MODES),
  latency_ms: z.number().nullish(),
  input_tokens: z.number().int().nullish(),
  output_tokens: z.number().int().nullish(),
  cache_hit: z.boolean().default(false),
  trace_id: z.string().nullish(),
});

/** POST /query 응답. 200(answered · needs_clarification · abstained)과 오류 상태 코드(status=error) 모두 이 모양이다 */
export const queryResponseSchema = z
  .object({
    request_id: z.string(),
    status: z.enum(ANSWER_STATUSES),
    answer: z.string(),
    reason: z.string(),
    citations: z.array(citationSchema).default([]),
    error_code: z.enum(ERROR_CODES).nullish(),
    meta: queryMetaSchema,
  })
  // 계약의 불변식. 어기면 서버 버그라 bad_response 로 드러낸다
  .superRefine((raw, ctx) => {
    if ((raw.status === "error") !== (raw.error_code != null)) {
      ctx.addIssue({
        code: "custom",
        message: "error_code 는 status=error 일 때만, 그리고 반드시 있어야 한다",
      });
    }
    if (raw.status === "answered" && raw.citations.length === 0) {
      ctx.addIssue({ code: "custom", message: "answered 응답은 출처가 1개 이상이어야 한다" });
    }
  })
  .transform((raw): QueryResponse => ({
    requestId: raw.request_id,
    status: raw.status,
    answer: raw.answer,
    reason: raw.reason,
    citations: raw.citations.map((c) => ({
      sourceId: c.source_id,
      bookId: c.book_id,
      fileName: c.file_name,
      page: c.page,
    })),
    errorCode: raw.error_code ?? null,
    meta: {
      retrievalMode: raw.meta.retrieval_mode,
      latencyMs: raw.meta.latency_ms ?? null,
      inputTokens: raw.meta.input_tokens ?? null,
      outputTokens: raw.meta.output_tokens ?? null,
      cacheHit: raw.meta.cache_hit,
      traceId: raw.meta.trace_id ?? null,
    },
  }));

/** 422 응답 본문 (FastAPI 요청 검증 오류) */
export const validationErrorSchema = z.object({
  detail: z.array(z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string() })),
});

/** 화면 형식 요청 → 서버 형식 본문 */
export function toQueryBody(request: QueryRequest): QueryBody {
  return {
    question: request.question,
    retrieval_mode: request.retrievalMode,
    session_id: request.sessionId,
  };
}
