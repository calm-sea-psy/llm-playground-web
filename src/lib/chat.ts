// 대화 화면의 메시지 · 대화 모델과 만들기 · 바꾸기 함수. React 를 쓰지 않는 순수 함수만 둔다.

import type { RequestErrorCode } from "../api/client";
import type { AskEnd, AskMode, AskProgress, Source } from "../api/types";

/** 사이드바 제목 최대 글자 수 */
const MAX_TITLE_LENGTH = 40;

/** 답이 중간에 끊긴 이유 (done 의 failed · timed_out · truncated 를 이 순서로 하나만 본다) */
export const ANSWER_CUTS = ["failed", "timed_out", "truncated"] as const;
/** ANSWER_CUTS 의 값 하나 */
export type AnswerCut = (typeof ANSWER_CUTS)[number];

/** 지금까지 받은 단계 (마지막 stage 이벤트) */
export interface AnswerStage {
  /** 단계 이름. 계약에 없는 이름일 수 있다 */
  name: string;
  /** 서버의 안내 문구 */
  message: string;
}

/** 스트림에서 모은 답. 받는 중 · 끝난 뒤 · 끊긴 뒤 모두 이 모양이다 (끊겨도 받은 만큼은 보여 준다) */
export interface Answer {
  /** delta 를 이어 붙인 답 */
  text: string;
  /** 마지막 sources 이벤트의 출처 (number 오름차순) */
  sources: Source[];
  /** 마지막 단계. 아직 받지 못했으면 null */
  stage: AnswerStage | null;
}

/** 유저 질문 */
export interface QuestionMessage {
  id: string;
  role: "user";
  text: string;
}

/**
 * 답변 진행 상태.
 * - pending: 받는 중 · stopped: 사용자가 중지함
 * - done: done 이벤트를 받음. cited 는 답에 나온 출처 번호, cut 은 중간에 끊긴 이유 (안 끊겼으면 null)
 * - error: 서버가 error 이벤트로 실패를 알림 (답 조각 없이)
 * - failed: 끝 이벤트를 받지 못함 (연결 실패 · 끊김 · 시간 초과 · 형식 오류 · 422)
 */
export type AnswerState =
  | { state: "pending" }
  | { state: "stopped" }
  | { state: "done"; cited: number[]; cut: AnswerCut | null }
  | { state: "error"; code: string; message: string }
  | { state: "failed"; failure: Exclude<RequestErrorCode, "aborted"> };

/** 답변 하나. question · mode 는 이 답변을 부른 질문과 답변 방식이다 */
export type AnswerMessage = {
  id: string;
  role: "assistant";
  question: string;
  mode: AskMode;
  answer: Answer;
} & AnswerState;

/** 대화 안의 질문 또는 답변 하나 */
export type Message = QuestionMessage | AnswerMessage;

/** 대화 하나. 브라우저에만 있다 (서버는 질문마다 따로 답하고 대화를 기억하지 않는다) */
export interface Conversation {
  id: string;
  /** 첫 질문 첫 줄 (사이드바 제목) */
  title: string;
  /** 마지막 활동 시각 (ms): 질문을 보낸 때 · 답이 끝난 때. 사이드바 최신순 · 날짜 묶음 기준 */
  updatedAt: number;
  messages: Message[];
}

/** 아직 아무것도 받지 못한 답 */
export const EMPTY_ANSWER: Answer = { text: "", sources: [], stage: null };

/** UUID v4 의 i 번째 바이트: 7번째는 버전(4), 9번째는 변형(RFC 4122) 비트를 박는다 */
function uuidV4Byte(byte: number, i: number): number {
  if (i === 6) {
    return (byte & 0x0f) | 0x40;
  }
  if (i === 8) {
    return (byte & 0x3f) | 0x80;
  }
  return byte;
}

function cutOf(end: Extract<AskEnd, { event: "done" }>): AnswerCut | null {
  if (end.failed) {
    return "failed";
  }
  if (end.timedOut) {
    return "timed_out";
  }
  return end.truncated ? "truncated" : null;
}

// 한 답변 메시지를 바꾼 새 대화 목록. 다른 대화 · 메시지 객체는 그대로 둔다 (다시 그리지 않게)
function withAnswerMessage(
  conversations: Conversation[],
  conversationId: string,
  answerId: string,
  change: (message: AnswerMessage) => AnswerMessage,
  now?: number,
): Conversation[] {
  return conversations.map((c) =>
    c.id === conversationId
      ? {
          ...c,
          updatedAt: now ?? c.updatedAt,
          messages: c.messages.map((m) =>
            m.id === answerId && m.role === "assistant" ? change(m) : m,
          ),
        }
      : c,
  );
}

/**
 * 추측할 수 없는 UUID v4. 대화 id 와 메시지 id 에 쓴다.
 * crypto.randomUUID 는 보안 컨텍스트(HTTPS · localhost)에만 있어, HTTP 주소에서도 있는 crypto.getRandomValues 로 만든다
 */
export function newId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte, i) =>
    uuidV4Byte(byte, i).toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 진행 이벤트 하나를 답에 더한다. sources 는 앞의 것을 대신한다 (계약) */
export function answerWith(answer: Answer, progress: AskProgress): Answer {
  switch (progress.event) {
    case "stage":
      return { ...answer, stage: { name: progress.stage, message: progress.message } };
    case "sources":
      return { ...answer, sources: progress.sources };
    case "delta":
      return { ...answer, text: answer.text + progress.text };
  }
}

/** 끝 이벤트 → 답변 상태 */
export function stateFromEnd(end: AskEnd): AnswerState {
  return end.event === "done"
    ? { state: "done", cited: end.cited, cut: cutOf(end) }
    : { state: "error", code: end.code, message: end.message };
}

/** 사이드바 제목: 첫 줄, 최대 MAX_TITLE_LENGTH 자 */
export function titleFrom(text: string): string {
  const [line = ""] = text.trim().split("\n");
  const chars = Array.from(line);
  return chars.length > MAX_TITLE_LENGTH ? `${chars.slice(0, MAX_TITLE_LENGTH).join("")}…` : line;
}

/** 화면에 보이는 대화 제목. 비었으면 "제목 없음" */
export function titleOf(conversation: Conversation): string {
  return conversation.title || "제목 없음";
}

/** 답변을 기다리는 중인 메시지가 있는지 */
export function hasPendingAnswer(messages: Message[]): boolean {
  return messages.some((m) => m.role === "assistant" && m.state === "pending");
}

/** 질문 하나를 보낼 때 쓰는 id 와 시각. 부르는 쪽이 만들어 넘겨 함수는 순수하게 둔다 */
export interface QuestionDraft {
  conversationId: string;
  questionId: string;
  /** 기다리는 답변 메시지 id. 이벤트가 오면 이 메시지를 바꾼다 */
  answerId: string;
  text: string;
  mode: AskMode;
  /** 보낸 시각 (ms) */
  now: number;
}

/**
 * 대화에 질문과 기다리는 답변을 붙인 새 대화. 이어서 묻는 대화가 없으면 질문 첫 줄을 제목으로 새로 만든다.
 *
 * @param existing 이어서 묻는 대화. 새 대화면 undefined
 */
export function withQuestion(
  existing: Conversation | undefined,
  draft: QuestionDraft,
): Conversation {
  return {
    id: draft.conversationId,
    title: existing?.title ?? titleFrom(draft.text),
    updatedAt: draft.now,
    messages: [
      ...(existing?.messages ?? []),
      { id: draft.questionId, role: "user", text: draft.text },
      {
        id: draft.answerId,
        role: "assistant",
        question: draft.text,
        mode: draft.mode,
        answer: EMPTY_ANSWER,
        state: "pending",
      },
    ],
  };
}

/** 받는 중인 답변에 진행 이벤트를 더한 새 대화 목록. updatedAt 은 그대로 둔다 (끝날 때 바꾼다) */
export function withAnswerProgress(
  conversations: Conversation[],
  conversationId: string,
  answerId: string,
  progress: AskProgress,
): Conversation[] {
  return withAnswerMessage(conversations, conversationId, answerId, (m) => ({
    ...m,
    answer: answerWith(m.answer, progress),
  }));
}

/** 한 답변의 진행 상태를 바꾼 새 대화 목록. 받은 답은 그대로 두고, 그 대화의 updatedAt 을 now 로 바꾼다 */
export function withAnswerState(
  conversations: Conversation[],
  conversationId: string,
  answerId: string,
  next: AnswerState,
  now: number,
): Conversation[] {
  return withAnswerMessage(
    conversations,
    conversationId,
    answerId,
    (m) => ({
      id: m.id,
      role: m.role,
      question: m.question,
      mode: m.mode,
      answer: m.answer,
      ...next,
    }),
    now,
  );
}
