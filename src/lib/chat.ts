import type { QueryResponse, RetrievalMode } from "../api/types";

/** 사이드바 제목 최대 글자 수 */
const MAX_TITLE_LENGTH = 40;

/** 화면이 보여 줄 오류. code 는 서버 error_code 또는 QueryError code, message 는 로그용 원인 */
export interface AnswerError {
  code: string;
  message: string;
}

/**
 * 메시지 상태 (화면 쪽 진행). 서버가 준 결과 상태는 response.status 에 따로 있다.
 * - pending: 보냈고 응답을 기다리는 중
 * - done: 응답을 받음 (answered · needs_clarification · abstained)
 * - error: 서버가 status="error" 로 답했거나 응답을 받지 못함
 * - stopped: 사용자가 중지함
 */
export const MESSAGE_STATUSES = ["pending", "done", "error", "stopped"] as const;
/** MESSAGE_STATUSES 의 값 하나 */
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** 메시지를 쓴 쪽 */
export const MESSAGE_ROLES = ["user", "assistant"] as const;
/** MESSAGE_ROLES 의 값 하나 */
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** 대화 안의 질문 또는 답변 하나 */
export interface Message {
  id: string;
  role: MessageRole;
  /** 유저: 질문 원문. 답변: 결론(answer) — 복사 · 스크린 리더 알림에 쓴다 */
  content: string;
  status: MessageStatus;
  /** 메시지를 만든 시각 (ms). 기다린 시간 표시에 쓴다 */
  createdAt: number;
  /** 답변: 보낸 검색 방식 (다시 시도용) */
  retrievalMode?: RetrievalMode;
  /** 답변: /query 응답 */
  response?: QueryResponse;
  /** 답변: 오류 안내 */
  error?: AnswerError;
  /** 답변이 끝난(done · 오류 · 중지) 시각. createdAt 과의 차이 = 화면에서 잰 전체 시간 */
  finishedAt?: number;
}

/** 질문 내역 한 건 = 서버 대화 세션 하나 */
export interface Conversation {
  id: string;
  /** 첫 질문 첫 줄 */
  title: string;
  createdAt: number;
  /** 마지막 활동 시각 (질문을 보낸 · 답변이 끝난 때). 사이드바 최신순 정렬 기준 */
  updatedAt: number;
  /** 대화 세션 id. 첫 질문을 보낼 때 받고, 이 대화의 질문은 모두 이 id 로 보낸다 */
  sessionId?: string;
  messages: Message[];
}

/** 답변을 기다리는 중인지 */
export function isReceiving(message: Message): boolean {
  return message.status === "pending";
}

/** 메시지 · 대화 id */
export function newId(): string {
  return crypto.randomUUID();
}

/** 메시지가 없는 새 대화 */
export function newConversation(): Conversation {
  const now = Date.now();
  return { id: newId(), title: "", createdAt: now, updatedAt: now, messages: [] };
}

/** 사이드바 제목: 첫 줄, 최대 MAX_TITLE_LENGTH 자 */
export function titleFrom(text: string): string {
  const [line = ""] = text.trim().split("\n");
  const chars = Array.from(line);
  return chars.length > MAX_TITLE_LENGTH ? `${chars.slice(0, MAX_TITLE_LENGTH).join("")}…` : line;
}

/** 서버와 같은 방식(코드 포인트)으로 센 글자 수 */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** 다시 보낼 질문과 검색 방식 */
export interface ResendTarget {
  question: string;
  retrievalMode: RetrievalMode;
}

/**
 * 답변 하나를 다시 받을 때 보낼 질문(그 답변 바로 앞의 유저 메시지)과 검색 방식.
 *
 * @returns 답변을 찾지 못했거나 앞에 질문이 없거나 검색 방식 기록이 없으면 undefined
 */
export function resendTargetOf(messages: Message[], assistantId: string): ResendTarget | undefined {
  const index = messages.findIndex((m) => m.id === assistantId);
  const retrievalMode = messages[index]?.retrievalMode; // 못 찾으면 index 가 -1 이라 여기서 undefined
  const question = messages.slice(0, index).findLast((m) => m.role === "user");
  return question && retrievalMode ? { question: question.content, retrievalMode } : undefined;
}

/** 대화의 마지막 답변이 확인 질문(needs_clarification)인지. 입력창 안내를 바꾸는 데 쓴다 */
export function isAwaitingClarification(messages: Message[]): boolean {
  const last = messages.findLast((m) => m.role === "assistant");
  return last?.status === "done" && last.response?.status === "needs_clarification";
}
