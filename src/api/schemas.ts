// 서버 응답(snake_case) 검증 · 변환. 서버 형식이 바뀌면 이 파일만 고친다.
// 원본: Seal_LLM src/theseal/api/schemas.py (origin/main 기준)

import { z } from "zod";

import {
  LABELS,
  PROVIDERS,
  ROUTES,
  STATUS_STAGES,
  VERIFY_MODES,
  type AnswerResponse,
  type Health,
  type RoutingResult,
  type StatusEvent,
} from "./types";

/** GET /health */
export const healthSchema = z
  .object({
    classifier: z.string().nullable(),
    classifier_device: z.string().nullable(),
    classifier_error: z.string().nullable(),
    route_rule_enabled: z.boolean(),
    verify_mode: z.enum(VERIFY_MODES),
    default_provider: z.enum(PROVIDERS),
  })
  .transform((raw): Health => ({
    classifier: raw.classifier,
    classifierDevice: raw.classifier_device,
    classifierError: raw.classifier_error,
    routeRuleEnabled: raw.route_rule_enabled,
    verifyMode: raw.verify_mode,
    defaultProvider: raw.default_provider,
  }));

/** classification 이벤트 · done 응답의 classification */
export const routingResultSchema = z
  .object({
    label: z.enum(LABELS),
    text: z.string(),
    classifier_label: z.string(),
    scores: z.record(z.string(), z.number()),
    route: z
      .object({ route: z.enum(ROUTES), p1: z.number(), margin: z.number(), reason: z.string() })
      .nullable(),
    verification: z
      .object({
        match: z.boolean(),
        reason: z.string(),
        final_label: z.string(),
        latency_ms: z.number(),
        error: z.string().nullable(),
      })
      .nullable(),
  })
  .transform((raw): RoutingResult => ({
    label: raw.label,
    text: raw.text,
    classifierLabel: raw.classifier_label,
    scores: raw.scores,
    route: raw.route,
    verification: raw.verification && {
      match: raw.verification.match,
      reason: raw.verification.reason,
      finalLabel: raw.verification.final_label,
      latencyMs: raw.verification.latency_ms,
      error: raw.verification.error,
    },
  }));

const toolCallSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  ok: z.boolean(),
  error: z.string().nullish(),
  latency_ms: z.number(),
});

/** done 이벤트 · 400 응답 본문 */
export const answerResponseSchema = z
  .object({
    request_id: z.string(),
    status: z.enum(["ok", "error"]),
    label: z.string(),
    answer: z.string().nullable(),
    provider: z.enum(PROVIDERS),
    model: z.string(),
    prompt_version: z.string(),
    tools_used: z.array(toolCallSchema),
    latency_ms: z.number(),
    usage: z.object({ input_tokens: z.number().nullable(), output_tokens: z.number().nullable() }),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
    created_at: z.string(),
    classification: routingResultSchema.nullable(),
  })
  .transform((raw): AnswerResponse => ({
    requestId: raw.request_id,
    status: raw.status,
    label: raw.label,
    answer: raw.answer,
    provider: raw.provider,
    model: raw.model,
    promptVersion: raw.prompt_version,
    toolsUsed: raw.tools_used.map((tool) => ({
      name: tool.name,
      args: tool.args,
      ok: tool.ok,
      error: tool.error ?? null,
      latencyMs: tool.latency_ms,
    })),
    latencyMs: raw.latency_ms,
    usage: { inputTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens },
    error: raw.error,
    createdAt: raw.created_at,
    classification: raw.classification,
  }));

/** status 이벤트 */
export const statusEventSchema: z.ZodType<StatusEvent> = z.object({
  stage: z.enum(STATUS_STAGES),
  message: z.string(),
});

/** delta 이벤트 */
export const deltaEventSchema = z.object({ text: z.string() });
