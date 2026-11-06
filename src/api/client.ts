// 화면이 쓰는 API 계약. 구현은 httpClient.ts(실제 서버) · mockClient.ts(목업)이고, 앱 루트에서 ApiProvider 로 끼운다.

import type { HealthResponse, QueryRequest, QueryResponse } from "./types";

/**
 * 질문 요청 실패 원인. 서버가 status="error" 로 답한 경우(503 · 502 · 504 · 500 + 응답 본문)는
 * 이 코드가 아니라 QueryResponse 로 온다.
 * - aborted: 사용자가 중지함
 * - network: 연결 실패 · 연결 끊김 · 응답 본문이 없는 HTTP 오류 (프록시 5xx = 백엔드 꺼짐)
 * - bad_response: 형식이 맞지 않는 응답
 * - invalid_question · invalid_retrieval_mode · invalid_request: 422 (어느 필드가 틀렸는지)
 */
export type QueryErrorCode =
  | "aborted"
  | "network"
  | "bad_response"
  | "invalid_question"
  | "invalid_retrieval_mode"
  | "invalid_request";

/** 질문 응답을 받지 못한 경우의 오류 */
export class QueryError extends Error {
  readonly code: QueryErrorCode;

  constructor(code: QueryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QueryError";
    this.code = code;
  }
}

/** 화면이 서버에 요청하는 것 */
export interface ApiClient {
  /** 서버 상태. 연결 실패 · 시간 초과 · 5xx · 형식 오류는 예외로 던진다 */
  getHealth: (signal?: AbortSignal) => Promise<HealthResponse>;
  /**
   * 새 대화 세션 id. 지금은 브라우저에서 만든다.
   * 서버 세션(/session · Redis)이 생기면 구현만 서버 호출로 바꾼다.
   */
  createSession: (signal?: AbortSignal) => Promise<string>;
  /**
   * 질문을 보내 답을 받는다 (status 가 "error" 일 수 있다).
   *
   * @throws QueryError 응답을 받지 못했거나 요청이 422 로 거절됐을 때
   */
  query: (request: QueryRequest, signal?: AbortSignal) => Promise<QueryResponse>;
}
