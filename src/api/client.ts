// 화면이 서버에 요청하는 계약. 구현은 httpClient.ts(실제 서버) · mockClient.ts(서버 없는 목업)이고, 앱 루트에서 ApiProvider 로 끼운다.

import type { AskEnd, AskProgress, AskRequest, HealthResponse } from "./types";

/**
 * 요청이 응답을 끝까지 받지 못했거나 거절된 이유. 서버가 error 이벤트로 실패를 알린 경우는 이 오류가 아니라 AskEnd 로 온다.
 * - aborted: 사용자가 중지함
 * - network: 서버에 닿지 못함 (연결 실패 · 본문 없는 HTTP 오류. 프록시 5xx = 백엔드 꺼짐)
 * - interrupted: 답을 받다가 끊김 (done · error 없이 스트림이 끝났거나 읽다가 연결이 끊김)
 * - timeout: 서버가 STREAM_IDLE_TIMEOUT_MS 동안 아무것도 보내지 않음
 * - bad_response: 응답이 계약과 다름 (이벤트 스트림이 아님 · 이벤트 data 가 계약과 다름)
 * - invalid_question · invalid_mode · invalid_request: 422 (어느 값이 거절됐는지)
 */
export const REQUEST_ERROR_CODES = [
  "aborted",
  "network",
  "interrupted",
  "timeout",
  "bad_response",
  "invalid_question",
  "invalid_mode",
  "invalid_request",
] as const;
/** REQUEST_ERROR_CODES 의 값 하나 */
export type RequestErrorCode = (typeof REQUEST_ERROR_CODES)[number];

/** 응답을 끝까지 받지 못했거나 요청이 거절된 경우의 오류. message 는 로그용 원인이다 */
export class RequestError extends Error {
  readonly code: RequestErrorCode;

  constructor(code: RequestErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RequestError";
    this.code = code;
  }
}

/** 화면이 서버에 요청하는 것 */
export interface ApiClient {
  /**
   * 서버 상태.
   *
   * @throws RequestError 응답을 받지 못했거나 형식이 계약과 다를 때
   */
  getHealth: (signal?: AbortSignal) => Promise<HealthResponse>;
  /**
   * 질문을 보내 답을 흘려 받는다. 끝 이벤트(done · error) 전의 이벤트는 받을 때마다 onProgress 로 넘긴다.
   *
   * @returns 끝 이벤트 (error 면 서버가 답을 못 만들었다고 알린 것)
   * @throws RequestError 끝 이벤트를 받지 못했거나 요청이 422 로 거절됐을 때
   */
  ask: (
    request: AskRequest,
    onProgress: (event: AskProgress) => void,
    signal?: AbortSignal,
  ) => Promise<AskEnd>;
}
