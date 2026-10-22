// 화면이 쓰는 API 계약. 구현은 httpClient.ts(실제 서버) · mockClient.ts(목업)이고, 앱 루트에서 ApiProvider 로 끼운다.

import type { AnswerRequest, AnswerResponse, Health, RoutingResult, StatusEvent } from "./types";

/** 답변 스트림 실패 원인. 서버가 보낸 오류(입력 오류 · done status="error")는 이 코드가 아니라 AnswerResponse 로 온다 */
export type AnswerStreamErrorCode = "aborted" | "network" | "incomplete" | "bad_response";

/**
 * done 을 받지 못한 경우의 오류.
 * - aborted: 사용자가 중지함
 * - network: 연결 실패 · 연결 끊김 · 프록시 5xx(백엔드 꺼짐)
 * - incomplete: done 없이 스트림이 끝남
 * - bad_response: 형식이 맞지 않는 응답
 */
export class AnswerStreamError extends Error {
  readonly code: AnswerStreamErrorCode;

  constructor(code: AnswerStreamErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AnswerStreamError";
    this.code = code;
  }
}

/** 답변 스트림 중간 이벤트를 받는 곳 */
export interface AnswerStreamHandlers {
  onStatus?: (event: StatusEvent) => void;
  /** 분류를 거쳤을 때만 온다 */
  onClassification?: (result: RoutingResult) => void;
  /** 답변 글자 조각. adventure(범위 밖 문의)에서는 오지 않는다 */
  onDelta?: (text: string) => void;
}

/** 화면이 서버에 요청하는 두 가지 */
export interface ApiClient {
  /** 서버 상태. 연결 실패 · 시간 초과 · 5xx · 형식 오류는 예외로 던진다 */
  getHealth: (signal?: AbortSignal) => Promise<Health>;
  /**
   * 답변을 받는다. 이벤트는 handlers 로 흘리고 done 의 AnswerResponse 를 돌려준다 (status 가 "error" 일 수 있다).
   *
   * @throws AnswerStreamError done 을 받지 못했을 때
   */
  answerStream: (
    request: AnswerRequest,
    handlers?: AnswerStreamHandlers,
    signal?: AbortSignal,
  ) => Promise<AnswerResponse>;
}
