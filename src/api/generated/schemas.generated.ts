// 이 파일은 scripts/gen-schemas.mjs 가 contracts/openapi.json 에서 만든다. 손으로 고치지 않는다 (npm run gen:api).
// 서버 형식(snake_case) zod 스키마(*Raw), 화면 타입(camelCase), 서버 → 화면 변환 함수(to*), 화면 → 서버 요청 본문 함수(to*Body),
// 요청 제약 상수(*_MAX_LENGTH · *_PATTERN · *_MAXIMUM 등), 파라미터 값 목록(*S · *_DEFAULT), 이벤트 스트림(*_EVENTS · *Event · *EventDataSchemas).

import { z } from "zod";

import type { components, operations } from "./openapi";

type Schemas = components["schemas"];

/** 에이전트 모드(mode=agent)의 진단. 하위 질문 · 검색어 글은 질문을 옮겨 담아서 넣지 않는다. */
export const agentDiagnosticsRaw = z.object({
  route: z.enum([
    "gate",
    "single_refuse",
    "single_found",
    "single_error",
    "escalated_not_found",
    "escalated_partial",
    "gate_sub",
  ]),
  steps: z.array(z.enum(["decompose", "search", "judge", "compose"])),
  decompose: z.enum(["ok", "fallback", "error"]).nullable(),
  sub_questions: z.number().int(),
  searches: z.number().int(),
  iterations: z.number().int(),
  evidence: z.number().int(),
  answer_documents: z.number().int(),
  judgments: z.array(z.enum(["sufficient", "insufficient", "error"])),
  stop: z
    .enum(["sufficient", "max_iterations", "no_new_queries", "judge_error", "gate_sub"])
    .nullable(),
  prompt_versions: z.array(z.string()),
  timings_ms: z.record(z.string(), z.number()),
  seed_hits: z.number().int(),
  answer_top_score: z.number().nullable(),
});

/** 에이전트 모드(mode=agent)의 진단. 하위 질문 · 검색어 글은 질문을 옮겨 담아서 넣지 않는다. */
export interface AgentDiagnostics {
  /** 간 길. single_* 는 그래프를 돌리지 않고 단발로 끝난 것 */
  route:
    | "gate"
    | "single_refuse"
    | "single_found"
    | "single_error"
    | "escalated_not_found"
    | "escalated_partial"
    | "gate_sub";
  /** 거친 노드 (차례대로) */
  steps: ("decompose" | "search" | "judge" | "compose")[];
  /** 질문 나누기 상태. 그래프를 안 돌았으면 null */
  decompose: "ok" | "fallback" | "error" | null;
  /** 하위 질문 수 */
  subQuestions: number;
  /** 검색 횟수 */
  searches: number;
  /** 검색 반복 수 */
  iterations: number;
  /** 모은 청크 수 */
  evidence: number;
  /** 답변 근거 수 */
  answerDocuments: number;
  /** 판단 노드의 결론 (차례대로) */
  judgments: ("sufficient" | "insufficient" | "error")[];
  /** 검색 반복을 멈춘 이유. 그래프를 안 돌았으면 null */
  stop: "sufficient" | "max_iterations" | "no_new_queries" | "judge_error" | "gate_sub" | null;
  /** 노드 프롬프트 (이름@버전:해시) */
  promptVersions: string[];
  /** 노드 → 걸린 시간 (ms) */
  timingsMs: Record<string, number>;
  /** 이어 받은 원문 검색 청크 수 */
  seedHits: number;
  /** 답변 근거 1위 점수 */
  answerTopScore: number | null;
}

/** AgentDiagnostics 서버 형식 → 화면 형식 */
export function toAgentDiagnostics(raw: z.output<typeof agentDiagnosticsRaw>): AgentDiagnostics {
  return {
    route: raw.route,
    steps: raw.steps,
    decompose: raw.decompose,
    subQuestions: raw.sub_questions,
    searches: raw.searches,
    iterations: raw.iterations,
    evidence: raw.evidence,
    answerDocuments: raw.answer_documents,
    judgments: raw.judgments,
    stop: raw.stop,
    promptVersions: raw.prompt_versions,
    timingsMs: raw.timings_ms,
    seedHits: raw.seed_hits,
    answerTopScore: raw.answer_top_score,
  };
}

/** AskRequest.question 최대 길이 (계약 maxLength) */
export const ASK_REQUEST_QUESTION_MAX_LENGTH = 300;

/** AskRequest.question 최소 길이 (계약 minLength) */
export const ASK_REQUEST_QUESTION_MIN_LENGTH = 1;

/** 답변 요청. 응답은 text/event-stream (stage · sources · delta · done · error). · AskRequest 화면 형식 (요청). 선택 여부는 계약 그대로다 */
export interface AskRequestInput {
  /** 자연어 질문 */
  question: string;
}

/** AskRequest 화면 형식 → 서버 형식 요청 본문 */
export function toAskRequestBody(request: AskRequestInput): Schemas["AskRequest"] {
  return {
    question: request.question,
  };
}

/** delta 이벤트 data — 답 조각. */
export const deltaEventRaw = z.object({
  text: z.string(),
});

/** delta 이벤트 data — 답 조각. */
export interface DeltaEvent {
  /** 이어 붙이면 답 전체. grounded 표지와 범위 밖 출처 번호는 서버가 떼고 보낸다. 질문 관문 · refuse 는 고정 문구 한 조각 */
  text: string;
}

/** DeltaEvent 서버 형식 → 화면 형식 */
export function toDeltaEvent(raw: z.output<typeof deltaEventRaw>): DeltaEvent {
  return {
    text: raw.text,
  };
}

/** 질문 관문에 걸린 근거. 질문 원문이 아니라 규칙 사전의 말만 든다. */
export const gateDiagnosticsRaw = z.object({
  rule: z.enum(["smalltalk", "realtime", "safety"]),
  kind: z.enum([
    "greeting",
    "thanks",
    "farewell",
    "identity",
    "chitchat",
    "realtime",
    "crisis",
    "grooming",
  ]),
  matched: z.array(z.string()),
});

/** 질문 관문에 걸린 근거. 질문 원문이 아니라 규칙 사전의 말만 든다. */
export interface GateDiagnostics {
  /** 걸린 규칙 */
  rule: "smalltalk" | "realtime" | "safety";
  /** 규칙 안의 종류 */
  kind:
    | "greeting"
    | "thanks"
    | "farewell"
    | "identity"
    | "chitchat"
    | "realtime"
    | "crisis"
    | "grooming";
  /** 건 근거 낱말 */
  matched: string[];
}

/** GateDiagnostics 서버 형식 → 화면 형식 */
export function toGateDiagnostics(raw: z.output<typeof gateDiagnosticsRaw>): GateDiagnostics {
  return {
    rule: raw.rule,
    kind: raw.kind,
    matched: raw.matched,
  };
}

/** 요청 하나에 걸린 시간 (ms). 그 단계를 지나지 않았으면 null. */
export const timingsRaw = z.object({
  search: z.number().nullable(),
  first_delta: z.number().nullable(),
  total: z.number().nullable(),
});

/** 요청 하나에 걸린 시간 (ms). 그 단계를 지나지 않았으면 null. */
export interface Timings {
  /** 검색. 에이전트 모드는 원문 검색과 검색 노드의 합 */
  search: number | null;
  /** 요청부터 첫 답 조각까지 */
  firstDelta: number | null;
  /** 요청부터 끝까지 */
  total: number | null;
}

/** Timings 서버 형식 → 화면 형식 */
export function toTimings(raw: z.output<typeof timingsRaw>): Timings {
  return {
    search: raw.search,
    firstDelta: raw.first_delta,
    total: raw.total,
  };
}

/** 요청 하나의 진단 — done 이벤트에 싣고, 같은 항목을 서버 로그 한 줄로 남긴다. */
export const diagnosticsRaw = z.object({
  stage_path: z.array(
    z.enum([
      "gate",
      "grounded",
      "partial",
      "refuse",
      "agent_decompose",
      "agent_search",
      "agent_judge",
    ]),
  ),
  gate: gateDiagnosticsRaw.nullable(),
  top_score: z.number().nullable(),
  marker: z.enum(["found", "not_found", "missing"]).nullable(),
  done_reason: z.record(z.string(), z.enum(["stop", "length"]).nullable()),
  spec_id: z.string().nullable(),
  prompt_version: z.string().nullable(),
  question_chars: z.number().int(),
  question_sha256: z.string(),
  timings_ms: timingsRaw,
  agent: agentDiagnosticsRaw.nullable().default(null),
});

/** 요청 하나의 진단 — done 이벤트에 싣고, 같은 항목을 서버 로그 한 줄로 남긴다. */
export interface Diagnostics {
  /** 거친 단계 */
  stagePath: (
    "gate" | "grounded" | "partial" | "refuse" | "agent_decompose" | "agent_search" | "agent_judge"
  )[];
  /** 질문 관문에 걸렸으면 그 근거 */
  gate: GateDiagnostics | null;
  /** 리랭커 1위 점수. 검색하지 않았으면 null */
  topScore: number | null;
  /** grounded 첫 줄 표지. 읽지 않았으면 null */
  marker: "found" | "not_found" | "missing" | null;
  /** 단계 → 생성이 멈춘 이유. 끊었거나 서버가 주지 않았으면 null */
  doneReason: Record<string, "stop" | "length" | null>;
  /** 마지막으로 생성한 단계의 모델 설정 */
  specId: string | null;
  /** 마지막으로 생성한 단계의 프롬프트 */
  promptVersion: string | null;
  /** 질문 글자 수 */
  questionChars: number;
  /** 질문의 HMAC-SHA256 (서버를 켤 때마다 바뀌는 키). 질문 원문은 싣지 않는다 */
  questionSha256: string;
  timingsMs: Timings;
  /** mode=agent 일 때만 있다. 단발이면 키가 없다 */
  agent: AgentDiagnostics | null;
}

/** Diagnostics 서버 형식 → 화면 형식 */
export function toDiagnostics(raw: z.output<typeof diagnosticsRaw>): Diagnostics {
  return {
    stagePath: raw.stage_path,
    gate: raw.gate == null ? null : toGateDiagnostics(raw.gate),
    topScore: raw.top_score,
    marker: raw.marker,
    doneReason: raw.done_reason,
    specId: raw.spec_id,
    promptVersion: raw.prompt_version,
    questionChars: raw.question_chars,
    questionSha256: raw.question_sha256,
    timingsMs: toTimings(raw.timings_ms),
    agent: raw.agent == null ? null : toAgentDiagnostics(raw.agent),
  };
}

/** done 이벤트 data — 끝. 답을 다 보냈다 (잘렸으면 truncated · timed_out · failed 가 참). */
export const doneEventRaw = z.object({
  stage_path: z.array(
    z.enum([
      "gate",
      "grounded",
      "partial",
      "refuse",
      "agent_decompose",
      "agent_search",
      "agent_judge",
    ]),
  ),
  cited: z.array(z.number().int()),
  dropped: z.array(z.number().int()),
  truncated: z.boolean(),
  timed_out: z.boolean(),
  failed: z.boolean(),
  diagnostics: diagnosticsRaw,
});

/** done 이벤트 data — 끝. 답을 다 보냈다 (잘렸으면 truncated · timed_out · failed 가 참). */
export interface DoneEvent {
  /** 거친 단계 */
  stagePath: (
    "gate" | "grounded" | "partial" | "refuse" | "agent_decompose" | "agent_search" | "agent_judge"
  )[];
  /** 답에 나온 출처 번호 (처음 나온 순서, 중복 없이) */
  cited: number[];
  /** 범위를 벗어나 뗀 출처 번호 */
  dropped: number[];
  /** 생성이 max_tokens 에 닿아 멈춤. 고정 문구면 false */
  truncated: boolean;
  /** 답을 보내던 중 단계 시간 제한에 걸려 끊김 */
  timedOut: boolean;
  /** 답을 보내던 중 생성이 실패해 끊김. 원인은 서버 로그에만 */
  failed: boolean;
  diagnostics: Diagnostics;
}

/** DoneEvent 서버 형식 → 화면 형식 */
export function toDoneEvent(raw: z.output<typeof doneEventRaw>): DoneEvent {
  return {
    stagePath: raw.stage_path,
    cited: raw.cited,
    dropped: raw.dropped,
    truncated: raw.truncated,
    timedOut: raw.timed_out,
    failed: raw.failed,
    diagnostics: toDiagnostics(raw.diagnostics),
  };
}

/** error 이벤트 data — 끝. 답 조각을 하나도 못 보낸 채 실패했다. */
export const errorEventRaw = z.object({
  code: z.enum(["generation", "timeout", "internal"]),
  message: z.string(),
});

/** error 이벤트 data — 끝. 답 조각을 하나도 못 보낸 채 실패했다. */
export interface ErrorEvent {
  /** generation: LLM 호출 실패 · timeout: partial 시간 초과 · internal: 그 밖의 서버 실패 */
  code: "generation" | "timeout" | "internal";
  /** 화면에 띄울 문구. 서버 사정은 싣지 않는다 */
  message: string;
}

/** ErrorEvent 서버 형식 → 화면 형식 */
export function toErrorEvent(raw: z.output<typeof errorEventRaw>): ErrorEvent {
  return {
    code: raw.code,
    message: raw.message,
  };
}

/** ValidationError 서버 형식 검증 */
export const validationErrorRaw = z.object({
  loc: z.array(z.union([z.string(), z.number().int()])),
  msg: z.string(),
  type: z.string(),
  input: z.unknown().optional(),
  ctx: z.record(z.string(), z.unknown()).optional(),
});

/** ValidationError 화면 형식 */
export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
  input: unknown;
  /** 서버가 보내지 않으면 null */
  ctx: Record<string, unknown> | null;
}

/** ValidationError 서버 형식 → 화면 형식 */
export function toValidationError(raw: z.output<typeof validationErrorRaw>): ValidationError {
  return {
    loc: raw.loc,
    msg: raw.msg,
    type: raw.type,
    input: raw.input,
    ctx: raw.ctx ?? null,
  };
}

/** HTTPValidationError 서버 형식 검증 */
export const httpValidationErrorRaw = z.object({
  detail: z.array(validationErrorRaw).optional(),
});

/** HTTPValidationError 화면 형식 */
export interface HTTPValidationError {
  /** 서버가 보내지 않으면 빈 목록 */
  detail: ValidationError[];
}

/** HTTPValidationError 서버 형식 → 화면 형식 */
export function toHTTPValidationError(
  raw: z.output<typeof httpValidationErrorRaw>,
): HTTPValidationError {
  return {
    detail: (raw.detail ?? []).map((item) => toValidationError(item)),
  };
}

/** 서버 상태. 웹 프론트엔드 사이드바가 쓴다. */
export const healthResponseRaw = z.object({
  status: z.literal("ok"),
  collection: z.string(),
  chunks: z.number().int(),
  qdrant: z.enum(["local", "cloud"]).nullable().optional(),
});

/** 서버 상태. 웹 프론트엔드 사이드바가 쓴다. */
export interface HealthResponse {
  /** 서버가 떴으면 늘 ok */
  status: "ok";
  /** 검색 대상 컬렉션 이름 */
  collection: string;
  /** BM25 색인에 올린 청크 수 */
  chunks: number;
  /** 검색이 붙은 Qdrant 의 위치: local(로컬 Docker) · cloud(Qdrant Cloud). 목업 서버는 null · 서버가 보내지 않으면 null */
  qdrant: "local" | "cloud" | null;
}

/** HealthResponse 서버 형식 → 화면 형식 */
export function toHealthResponse(raw: z.output<typeof healthResponseRaw>): HealthResponse {
  return {
    status: raw.status,
    collection: raw.collection,
    chunks: raw.chunks,
    qdrant: raw.qdrant ?? null,
  };
}

/** 검색된 청크 한 건. */
export const searchHitRaw = z.object({
  chunk_id: z.string(),
  doc_id: z.string(),
  title: z.string(),
  section: z.string(),
  text: z.string(),
  score: z.number(),
});

/** 검색된 청크 한 건. */
export interface SearchHit {
  /** 청크 id */
  chunkId: string;
  /** 원문서 id */
  docId: string;
  /** 원문서 제목 */
  title: string;
  /** 섹션 제목. 문서 첫머리면 빈 문자열 */
  section: string;
  /** "제목 > 섹션" 머리줄을 포함한 청크 본문 */
  text: string;
  /** 리랭커 관련도 0~1. 질의끼리 비교할 수 있다 */
  score: number;
}

/** SearchHit 서버 형식 → 화면 형식 */
export function toSearchHit(raw: z.output<typeof searchHitRaw>): SearchHit {
  return {
    chunkId: raw.chunk_id,
    docId: raw.doc_id,
    title: raw.title,
    section: raw.section,
    text: raw.text,
    score: raw.score,
  };
}

/** SearchRequest.query 최대 길이 (계약 maxLength) */
export const SEARCH_REQUEST_QUERY_MAX_LENGTH = 300;

/** SearchRequest.query 최소 길이 (계약 minLength) */
export const SEARCH_REQUEST_QUERY_MIN_LENGTH = 1;

/** SearchRequest.k 최솟값 (계약 minimum) */
export const SEARCH_REQUEST_K_MINIMUM = 1;

/** SearchRequest.k 최댓값 (계약 maximum) */
export const SEARCH_REQUEST_K_MAXIMUM = 20;

/** 검색 요청. · SearchRequest 화면 형식 (요청). 선택 여부는 계약 그대로다 */
export interface SearchRequestInput {
  /** 자연어 질문 또는 검색어 */
  query: string;
  /** 돌려받을 청크 수. 없으면 서버 기본값(5) */
  k?: number | null;
  /** 이 문서 id 들 안에서만 찾는다 · 빼면 [] */
  docIds?: string[];
  /** 이 분류 중 하나에 속한 문서에서만 찾는다 · 빼면 [] */
  categories?: string[];
}

/** SearchRequest 화면 형식 → 서버 형식 요청 본문 */
export function toSearchRequestBody(request: SearchRequestInput): Schemas["SearchRequest"] {
  return {
    query: request.query,
    k: request.k,
    doc_ids: request.docIds ?? [],
    categories: request.categories ?? [],
  };
}

/** 검색 응답. */
export const searchResponseRaw = z.object({
  query: z.string(),
  collection: z.string(),
  took_ms: z.number(),
  hits: z.array(searchHitRaw),
});

/** 검색 응답. */
export interface SearchResponse {
  /** 받은 질의 그대로 */
  query: string;
  /** 검색한 컬렉션 이름 */
  collection: string;
  /** 검색 시간(ms). 앞 요청을 기다린 시간은 빼고 */
  tookMs: number;
  /** score 내림차순 */
  hits: SearchHit[];
}

/** SearchResponse 서버 형식 → 화면 형식 */
export function toSearchResponse(raw: z.output<typeof searchResponseRaw>): SearchResponse {
  return {
    query: raw.query,
    collection: raw.collection,
    tookMs: raw.took_ms,
    hits: raw.hits.map((item) => toSearchHit(item)),
  };
}

/** 근거로 넘긴 문서 하나. */
export const sourceRaw = z.object({
  number: z.number().int(),
  title: z.string(),
  section: z.string(),
  url: z.string(),
  score: z.number(),
});

/** 근거로 넘긴 문서 하나. */
export interface Source {
  /** 답 속 [n] 의 번호. 1부터 */
  number: number;
  /** 위키백과 문서 제목 */
  title: string;
  /** 섹션 제목. 문서 첫머리면 빈 문자열 */
  section: string;
  /** 한국어 위키백과 문서 주소 */
  url: string;
  /** 리랭커 관련도 0~1 */
  score: number;
}

/** Source 서버 형식 → 화면 형식 */
export function toSource(raw: z.output<typeof sourceRaw>): Source {
  return {
    number: raw.number,
    title: raw.title,
    section: raw.section,
    url: raw.url,
    score: raw.score,
  };
}

/** sources 이벤트 data — 근거로 넘긴 문서. 여러 번 오면 뒤의 것이 앞의 것을 대신한다. */
export const sourcesEventRaw = z.object({
  sources: z.array(sourceRaw),
});

/** sources 이벤트 data — 근거로 넘긴 문서. 여러 번 오면 뒤의 것이 앞의 것을 대신한다. */
export interface SourcesEvent {
  /** number 오름차순. 문서 칸 예산에 다 안 들어가면 점수 낮은 문서는 뺀다. 빈 목록이면 앞서 보낸 출처를 거둔다 */
  sources: Source[];
}

/** SourcesEvent 서버 형식 → 화면 형식 */
export function toSourcesEvent(raw: z.output<typeof sourcesEventRaw>): SourcesEvent {
  return {
    sources: raw.sources.map((item) => toSource(item)),
  };
}

/** stage 이벤트 data — 단계에 들어섬. */
export const stageEventRaw = z.object({
  stage: z.enum([
    "gate",
    "grounded",
    "partial",
    "refuse",
    "agent_decompose",
    "agent_search",
    "agent_judge",
  ]),
  message: z.string(),
});

/** stage 이벤트 data — 단계에 들어섬. */
export interface StageEvent {
  /** 들어선 단계. 에이전트 모드는 agent_* 노드가 더 온다 */
  stage:
    "gate" | "grounded" | "partial" | "refuse" | "agent_decompose" | "agent_search" | "agent_judge";
  /** 화면에 띄울 안내 문구 */
  message: string;
}

/** StageEvent 서버 형식 → 화면 형식 */
export function toStageEvent(raw: z.output<typeof stageEventRaw>): StageEvent {
  return {
    stage: raw.stage,
    message: raw.message,
  };
}

/** POST /ask 의 mode 값 목록 (계약 query 파라미터) */
export const ASK_MODES = ["single", "agent"] as const;
/** ASK_MODES 의 값 하나 */
export type AskMode = (typeof ASK_MODES)[number];
/** POST /ask 의 mode 기본값 (보내지 않으면 서버가 쓰는 값) */
export const ASK_MODE_DEFAULT: AskMode = "single";

/** POST /ask 의 text/event-stream 이벤트 이름 (계약 itemSchema 순서) */
export const ASK_EVENTS = ["stage", "sources", "delta", "done", "error"] as const;
/** ASK_EVENTS 의 값 하나 */
export type AskEventName = (typeof ASK_EVENTS)[number];

/** POST /ask 의 이벤트 하나 (화면 형식). event 가 data 의 모양을 정한다 */
export type AskEvent =
  | { event: "stage"; data: StageEvent }
  | { event: "sources"; data: SourcesEvent }
  | { event: "delta"; data: DeltaEvent }
  | { event: "done"; data: DoneEvent }
  | { event: "error"; data: ErrorEvent };

/** POST /ask 이벤트 이름 → data(JSON 으로 읽은 값) 서버 형식 검증 · 화면 형식 변환 */
export const askEventDataSchemas = {
  stage: stageEventRaw.transform(toStageEvent),
  sources: sourcesEventRaw.transform(toSourcesEvent),
  delta: deltaEventRaw.transform(toDeltaEvent),
  done: doneEventRaw.transform(toDoneEvent),
  error: errorEventRaw.transform(toErrorEvent),
} satisfies { [E in AskEvent as E["event"]]: z.ZodType<E["data"]> };

// 생성한 스키마가 openapi-typescript 의 타입(openapi.d.ts)과 같은지 컴파일 때 확인한다 (생성 스크립트의 실수를 잡는다)
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Same<A, B> = Mutual<A, B> extends true ? Mutual<keyof A, keyof B> : false;
type Expect<T extends true> = T;
/** 생성 결과 확인용 (값으로 쓰지 않는다) */
export type GeneratedMatchesContract = [
  Expect<Same<z.output<typeof agentDiagnosticsRaw>, Schemas["AgentDiagnostics"]>>,
  Expect<Same<z.output<typeof deltaEventRaw>, Schemas["DeltaEvent"]>>,
  Expect<Same<z.output<typeof gateDiagnosticsRaw>, Schemas["GateDiagnostics"]>>,
  Expect<Same<z.output<typeof timingsRaw>, Schemas["Timings"]>>,
  Expect<Same<z.output<typeof diagnosticsRaw>, Schemas["Diagnostics"]>>,
  Expect<Same<z.output<typeof doneEventRaw>, Schemas["DoneEvent"]>>,
  Expect<Same<z.output<typeof errorEventRaw>, Schemas["ErrorEvent"]>>,
  Expect<Same<z.output<typeof validationErrorRaw>, Schemas["ValidationError"]>>,
  Expect<Same<z.output<typeof httpValidationErrorRaw>, Schemas["HTTPValidationError"]>>,
  Expect<Same<z.output<typeof healthResponseRaw>, Schemas["HealthResponse"]>>,
  Expect<Same<z.output<typeof searchHitRaw>, Schemas["SearchHit"]>>,
  Expect<Same<z.output<typeof searchResponseRaw>, Schemas["SearchResponse"]>>,
  Expect<Same<z.output<typeof sourceRaw>, Schemas["Source"]>>,
  Expect<Same<z.output<typeof sourcesEventRaw>, Schemas["SourcesEvent"]>>,
  Expect<Same<z.output<typeof stageEventRaw>, Schemas["StageEvent"]>>,
  Expect<
    Same<
      AskMode,
      NonNullable<NonNullable<operations["ask_ask_post"]["parameters"]["query"]>["mode"]>
    >
  >,
];
