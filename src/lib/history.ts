// 질문 내역 저장 (브라우저 저장소). 저장 API 가 없어 브라우저에만 남는다.
// 모든 읽기 · 쓰기는 try/catch — 저장이 안 되는 환경(시크릿 창 · 차단 · 용량 초과)에서도 화면은 동작한다.
// 저장 형식은 화면 형식(camelCase) 그대로다.

import { z } from "zod";

import {
  isReceiving,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  type Conversation,
  type Message,
} from "./chat";
import { logWarning } from "./logger";
import type { KeyValueStorage } from "./storage";
import { ANSWER_STATUSES, RETRIEVAL_MODES, type QueryResponse } from "../api/types";

/** 질문 내역 저장 키 */
export const HISTORY_KEY = "llm-playground:conversations:v1";
/** 마지막으로 보던 대화 저장 키 */
export const CURRENT_KEY = "llm-playground:current:v1";
/** 저장본 안의 형식 버전. 저장 모양이 바뀌면 올린다 (다른 버전 저장본은 빈 내역으로 본다) */
export const HISTORY_VERSION = 3; // 3: 계약 QueryResponse(error_code · meta) + 세션 id. 1 · 2 는 이전 형식

/** 보관 한도 (최신순). 대화 하나는 메타까지 수 KB → localStorage 한도(약 5MB) 안에 넉넉하다 */
export const MAX_CONVERSATIONS = 200;

/** 용량이 넘칠 때 한 번에 남기는 비율 (오래된 20% 를 버리고 다시) */
const SHRINK_RATIO = 0.8;

/** 불러온 내역 */
export interface LoadedHistory {
  conversations: Conversation[];
  /** 마지막으로 보던 대화. 없거나 지워졌으면 undefined */
  currentId: string | undefined;
}

const answerErrorSchema = z.object({ code: z.string(), message: z.string() });

/** 화면 형식(camelCase) 그대로 저장한 QueryResponse */
const storedQueryResponseSchema: z.ZodType<QueryResponse> = z.object({
  requestId: z.string(),
  status: z.enum(ANSWER_STATUSES),
  answer: z.string(),
  reason: z.string(),
  citations: z.array(
    z.object({ sourceId: z.string(), bookId: z.string(), fileName: z.string(), page: z.number() }),
  ),
  errorCode: z.string().nullable(),
  meta: z.object({
    retrievalMode: z.string(),
    latencyMs: z.number().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    cacheHit: z.boolean(),
    traceId: z.string().nullable(),
  }),
});

const messageSchema = z
  .object({
    id: z.string(),
    role: z.enum(MESSAGE_ROLES),
    content: z.string(),
    status: z.enum(MESSAGE_STATUSES),
    createdAt: z.number(),
    retrievalMode: z.enum(RETRIEVAL_MODES).optional().catch(undefined),
    // 응답은 렌더링이 그대로 읽는 값이라 전체 모양을 검증한다 (틀리면 렌더 중 예외). 맞지 않으면 그 응답만 버린다
    response: storedQueryResponseSchema.optional().catch(undefined),
    error: answerErrorSchema.optional().catch(undefined),
    finishedAt: z.number().optional().catch(undefined),
  })
  .transform((m): Message => ({
    ...withoutUndefined(m),
    // 받는 도중 탭이 닫혔던 답변
    status: m.status === "pending" ? "stopped" : m.status,
  }));

const conversationSchema: z.ZodType<Conversation> = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    sessionId: z.string().optional().catch(undefined),
    messages: z.array(messageSchema),
  })
  .transform((c): Conversation => withoutUndefined(c));

/**
 * 저장된 내역을 불러온다. 깨진 대화는 버리고 나머지는 살린다.
 * 받는 도중 탭이 닫혀 pending 으로 남은 답변은 stopped 로 바꾼다.
 */
export function loadHistory(storage: KeyValueStorage): LoadedHistory {
  let raw: string | null;
  let current: string | null;
  try {
    raw = storage.getItem(HISTORY_KEY);
    current = storage.getItem(CURRENT_KEY);
  } catch (e) {
    logWarning("질문 내역을 읽지 못했다", e);
    return { conversations: [], currentId: undefined };
  }

  const conversations = sortByRecent(
    readList(raw).flatMap((value) => {
      const parsed = conversationSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  );
  const currentId = conversations.find((c) => c.id === current)?.id;
  return { conversations, currentId };
}

/**
 * 내역을 저장한다 (최신순 최대 MAX_CONVERSATIONS 개). 용량이 넘치면 오래된 대화부터 줄여 다시 시도한다.
 *
 * @returns 저장했으면 true (일부를 줄였어도 true), 저장할 수 없으면 false
 */
export function saveHistory(storage: KeyValueStorage, conversations: Conversation[]): boolean {
  let keep = sortByRecent(conversations).slice(0, MAX_CONVERSATIONS);
  for (;;) {
    try {
      storage.setItem(
        HISTORY_KEY,
        JSON.stringify({ version: HISTORY_VERSION, conversations: keep }),
      );
      return true;
    } catch (e) {
      if (!isQuotaError(e) || keep.length <= 1) {
        logWarning("질문 내역을 저장하지 못했다", e);
        return false;
      }
      keep = keep.slice(0, Math.floor(keep.length * SHRINK_RATIO));
    }
  }
}

/** 마지막으로 보던 대화를 남긴다 (새로고침하면 다시 연다). 없으면 새 질문 화면 */
export function saveCurrentId(storage: KeyValueStorage, id: string | undefined): void {
  try {
    if (id) {
      storage.setItem(CURRENT_KEY, id);
    } else {
      storage.removeItem(CURRENT_KEY);
    }
  } catch (e) {
    logWarning("마지막으로 보던 대화를 저장하지 못했다", e); // 화면은 그대로 동작한다
  }
}

/**
 * 다른 탭이 저장한 대화를 이 탭 내역에 반영한다. 저장본이 기준이라 다른 탭에서 지운 대화는 여기서도 사라진다.
 * 이 탭이 답변을 받는 중인 대화만 이 탭 것을 남긴다.
 *
 * @returns 보던 대화가 사라졌으면 currentId 는 undefined (새 질문 화면)
 */
export function mergeSavedHistory(local: LoadedHistory, saved: Conversation[]): LoadedHistory {
  const receiving = local.conversations.filter((c) => c.messages.some(isReceiving));
  const receivingIds = new Set(receiving.map((c) => c.id));
  const conversations = [...receiving, ...saved.filter((c) => !receivingIds.has(c.id))];
  const hasCurrent = conversations.some((c) => c.id === local.currentId);
  return { conversations, currentId: hasCurrent ? local.currentId : undefined };
}

/** 최신 활동순으로 정렬한 새 배열 */
export function sortByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readList(raw: string | null): unknown[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    logWarning("질문 내역 저장본이 깨져 있어 버린다", e);
    return [];
  }
  return isObject(parsed) &&
    parsed.version === HISTORY_VERSION &&
    Array.isArray(parsed.conversations)
    ? parsed.conversations
    : [];
}

/** 값이 undefined 인 선택 필드를 빼서, 저장본과 같은 모양을 유지한다 */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
