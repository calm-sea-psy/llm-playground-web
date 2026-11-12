// 화면 안에서 쓰는 API 데이터 형식 (camelCase).
// 원본 계약: 팀 저장소 packages/common/src/common/{types,api}.py (RAG Q&A 인터페이스 계약 뷰어).
// 서버 형식(snake_case)은 httpClient 가 schemas.ts 로 검증 · 변환해서 이 형식으로 넘긴다.
// TODO: contracts/openapi.json 을 받으면 서버 형식 타입은 생성해서 쓰고, 이 파일은 화면 형식만 남긴다

/** 검색 방식 (RetrievalMode) */
export const RETRIEVAL_MODES = ["naive", "hybrid", "hybrid_rerank"] as const;
/** RETRIEVAL_MODES 의 값 하나 */
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

/** 답변 상태 (AnswerStatus) */
export const ANSWER_STATUSES = ["answered", "needs_clarification", "abstained", "error"] as const;
/** ANSWER_STATUSES 의 값 하나 */
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

/**
 * 계약의 오류 분류 (ErrorCode). status=error 일 때만 오고, 로그용이라 화면에는 사용자용 문구만 보인다.
 * 서버에 새 코드가 생겨도 응답을 버리지 않도록 응답(QueryResponse.errorCode)은 문자열로 받는다
 */
export const ERROR_CODES = [
  "index_not_ready",
  "retrieval_failed",
  "model_timeout",
  "model_failed",
  "output_invalid",
  "ingest_failed",
  "internal",
] as const;
/** ERROR_CODES 의 값 하나 */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** GET /health (HealthResponse) */
export interface HealthResponse {
  status: "ok";
  /** false 면 서버는 떴지만 검색 인덱스가 준비되지 않았다 */
  indexReady: boolean;
  indexName: string | null;
  embedderId: string | null;
  /** 서버가 지원하는 검색 방식 중 화면이 아는 것. 비어 있으면 알려 주지 않은 것 */
  supportedModes: RetrievalMode[];
}

/** 출처 한 건 (Citation). sourceId 는 요청 안에서만 유효하고 화면에 보이지 않는다 */
export interface Citation {
  sourceId: string;
  bookId: string;
  /** 문서명 (예: manual.pdf) */
  fileName: string;
  /** 쪽 번호 (첫 쪽 = 1) */
  page: number;
}

/** 응답 부가 정보 (QueryMeta) */
export interface QueryMeta {
  /** 실제로 쓴 검색 방식. 보통 RetrievalMode 지만 서버가 준 값을 그대로 둔다 */
  retrievalMode: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** 캐시에서 꺼낸 응답 */
  cacheHit: boolean;
  traceId: string | null;
}

/** POST /query 응답 (QueryResponse) */
export interface QueryResponse {
  requestId: string;
  status: AnswerStatus;
  /** 결론. needs_clarification 이면 되묻는 문장, abstained 면 보류 이유, error 면 서버의 사용자용 문구 */
  answer: string;
  /** 근거 */
  reason: string;
  /** answered 면 1개 이상 */
  citations: Citation[];
  /** status 가 "error" 일 때만, 그리고 반드시 있다. 보통 ErrorCode */
  errorCode: string | null;
  meta: QueryMeta;
}

/** POST /query 요청 (QueryRequest). 계약에서는 검색 방식 · 세션 id 가 선택이지만 화면은 항상 보낸다 */
export interface QueryRequest {
  /** 질문 원문 (1~MAX_INPUT_LENGTH 자, 공백만은 안 됨) */
  question: string;
  retrievalMode: RetrievalMode;
  /** 대화 세션 id (최대 128자). 같은 대화의 질문은 같은 id 로 보내 앞 문맥을 잇는다 */
  sessionId: string;
}
