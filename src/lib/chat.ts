import type {
  AnswerError,
  AnswerResponse,
  Provider,
  RoutingResult,
  StatusStage,
} from "../api/types";

/** 사이드바 제목 최대 글자 수 */
const MAX_TITLE_LENGTH = 40;

/**
 * 메시지 상태.
 * - pending: 보냈고 delta 가 아직 없음 (단계 문구 · 스켈레톤)
 * - stopped: 사용자가 중지함. 받은 데까지는 남긴다
 */
export const MESSAGE_STATUSES = ["pending", "streaming", "done", "error", "stopped"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** 대화 안의 문의 또는 답변 하나 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  /** 화면에 보이는 글 */
  content: string;
  status: MessageStatus;
  /** 메시지를 만든 시각 (ms). adventure 경과 시간 표시에 쓴다 */
  createdAt: number;
  /** pending 일 때 단계 */
  stage?: StatusStage;
  /** classification 이벤트 (done 전에 도착) */
  classification?: RoutingResult;
  /** 보낸 모델 (다시 시도 · 비교용) */
  provider?: Provider;
  /** done 응답 */
  meta?: AnswerResponse;
  /** 오류 안내. code 는 서버 error.code 또는 AnswerStreamError code */
  error?: AnswerError;
  /** 답변이 끝난(done · 오류 · 중지) 시각. createdAt 과의 차이 = 화면에서 잰 전체 시간 (분류 · 검증 포함) */
  finishedAt?: number;
  /** 유저 메시지: "다시 생성"으로 다시 보낸 문의 */
  regenerated?: boolean;
}

/** 문의 내역 한 건 */
export interface Conversation {
  id: string;
  /** 첫 문의 첫 줄 */
  title: string;
  createdAt: number;
  /** 마지막 활동 시각 (문의를 보낸 · 답변이 끝난 때). 사이드바 최신순 정렬 기준 */
  updatedAt: number;
  messages: Message[];
}

/** 답변을 받는 중인지 (pending · streaming) */
export function isReceiving(message: Message): boolean {
  return message.status === "pending" || message.status === "streaming";
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

/** 다시 보낼 문의와 모델 */
export interface ResendTarget {
  question: string;
  provider: Provider;
}

/**
 * 답변 하나를 다시 받을 때 보낼 문의(그 답변 바로 앞의 유저 메시지)와 모델.
 *
 * @returns 답변을 찾지 못했거나 앞에 문의가 없거나 모델 기록이 없으면 null
 */
export function resendTargetOf(messages: Message[], assistantId: string): ResendTarget | null {
  const index = messages.findIndex((m) => m.id === assistantId);
  if (index === -1) {
    return null;
  }
  const question = messages.slice(0, index).findLast((m) => m.role === "user");
  const { provider } = messages[index];
  return question && provider ? { question: question.content, provider } : null;
}
