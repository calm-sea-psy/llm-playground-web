// 화면 안에서 쓰는 API 데이터 형식 (camelCase).
// 서버 응답(snake_case)은 httpClient 가 schemas.ts 로 검증 · 변환해서 이 형식으로 넘긴다.

export const PROVIDERS = ["local", "openai"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const VERIFY_MODES = ["off", "uncertain", "all"] as const;
export type VerifyMode = (typeof VERIFY_MODES)[number];

export const LABELS = ["shipping", "refund", "account", "unknown"] as const;
export type Label = (typeof LABELS)[number];

export const ROUTES = ["confident", "low_confidence", "ambiguous", "unknown"] as const;
export type Route = (typeof ROUTES)[number];

/** /api/answer/stream 의 status 이벤트 단계. adventure = 범위 밖(unknown) 문의 (delta 없이 done 에 전체 답변) */
export const STATUS_STAGES = ["classifying", "answering", "adventure"] as const;
export type StatusStage = (typeof STATUS_STAGES)[number];

/** 서버 상태 (/health) */
export interface Health {
  classifier: string | null;
  classifierDevice: string | null;
  /** 분류 모델을 불러오지 못한 이유. 있으면 서버는 떴지만 분류는 안 된다 */
  classifierError: string | null;
  routeRuleEnabled: boolean;
  verifyMode: VerifyMode;
  defaultProvider: Provider;
}

/** 경로 규칙 판정 */
export interface RouteDecision {
  route: Route;
  /** 1위 확률 (보정 후) */
  p1: number;
  /** 1 · 2위 확률 차이 */
  margin: number;
  reason: string;
}

/** LLM 검증 결과 */
export interface Verification {
  match: boolean;
  reason: string;
  finalLabel: string;
  latencyMs: number;
  error: string | null;
}

/** 분류 결과 (classification 이벤트 · done 응답) */
export interface RoutingResult {
  label: Label;
  text: string;
  classifierLabel: string;
  /** 분류기 확률 (보정 전) */
  scores: Record<string, number>;
  route: RouteDecision | null;
  verification: Verification | null;
}

/** 답변 중 호출한 툴 하나 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  latencyMs: number;
}

/** 서버 오류 코드. 이 밖의 값도 올 수 있어 화면은 문자열로 다룬다 */
export type ErrorCode = "invalid_input" | "config_error" | "llm_error" | "llm_timeout";

export interface AnswerError {
  code: string;
  message: string;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

/** 답변 결과 (done 이벤트). status 가 "error" 면 answer 는 null 이고 error 가 있다 */
export interface AnswerResponse {
  requestId: string;
  status: "ok" | "error";
  label: string;
  answer: string | null;
  provider: Provider;
  model: string;
  promptVersion: string;
  toolsUsed: ToolCall[];
  /** 답변 생성 시간 (분류 · 검증 제외) */
  latencyMs: number;
  usage: TokenUsage;
  error: AnswerError | null;
  createdAt: string;
  classification: RoutingResult | null;
}

export interface StatusEvent {
  stage: StatusStage;
  message: string;
}

/** 답변 요청 */
export interface AnswerRequest {
  /** 문의 원문 (1~2000자) */
  text: string;
  /** 생략 시 서버 기본값 */
  provider?: Provider;
  /** 넣으면 분류를 건너뜀 (테스트용) */
  label?: Label;
}
