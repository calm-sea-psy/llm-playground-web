// 문의 내역 저장 (localStorage). 저장 API 가 없어 브라우저에만 남는다.
// 모든 읽기 · 쓰기는 try/catch — 저장이 안 되는 환경(시크릿 창 · 차단 · 용량 초과)에서도 화면은 동작한다.
//
// 저장 형식
// - v2: 화면 형식(camelCase) 그대로
// - v1: 답변 메타(meta · classification)가 서버 형식(snake_case). 불러올 때 v2 로 바꾸고, 다음 저장 때 v1 키를 지운다

import { z } from "zod";

import { MESSAGE_STATUSES, type Conversation, type Message } from "./chat";
import { answerResponseSchema, routingResultSchema } from "../api/schemas";
import { PROVIDERS, STATUS_STAGES, type AnswerResponse, type RoutingResult } from "../api/types";

export const HISTORY_KEY = "seal-frontend:conversations:v2";
export const LEGACY_HISTORY_KEY = "seal-frontend:conversations:v1";
export const CURRENT_KEY = "seal-frontend:current:v1";

/** 보관 한도 (최신순). 대화 하나는 메타까지 수 KB → localStorage 한도(약 5MB) 안에 넉넉하다 */
export const MAX_CONVERSATIONS = 200;

/** 용량이 넘칠 때 한 번에 남기는 비율 (오래된 20% 를 버리고 다시) */
const SHRINK_RATIO = 0.8;

/** 불러온 내역 */
export interface LoadedHistory {
  conversations: Conversation[];
  /** 마지막으로 보던 대화. 없거나 지워졌으면 null */
  currentId: string | null;
}

/** 저장본 버전마다 메타를 읽는 방법 */
interface MetaReaders {
  meta: z.ZodType<AnswerResponse | undefined>;
  classification: z.ZodType<RoutingResult | undefined>;
}

// v2 메타는 이 앱이 쓴 값이라 모양만 확인한다. 맞지 않으면 그 메타만 버린다
const V2_READERS: MetaReaders = {
  meta: z
    .custom<AnswerResponse>((v) => isObject(v) && typeof v.requestId === "string")
    .optional()
    .catch(undefined),
  classification: z
    .custom<RoutingResult>((v) => isObject(v) && typeof v.label === "string")
    .optional()
    .catch(undefined),
};

// v1 메타는 서버 형식 → 서버 응답과 같은 스키마로 바꾼다
const V1_READERS: MetaReaders = {
  meta: answerResponseSchema.optional().catch(undefined),
  classification: routingResultSchema.optional().catch(undefined),
};

/**
 * 저장된 내역을 불러온다. 깨진 대화는 버리고 나머지는 살린다.
 * 저장 도중 탭이 닫혀 pending · streaming 으로 남은 답변은 stopped 로 바꾼다.
 */
export function loadHistory(): LoadedHistory {
  let raw: string | null;
  let legacyRaw: string | null;
  let current: string | null;
  try {
    raw = localStorage.getItem(HISTORY_KEY);
    legacyRaw = raw === null ? localStorage.getItem(LEGACY_HISTORY_KEY) : null;
    current = localStorage.getItem(CURRENT_KEY);
  } catch {
    return { conversations: [], currentId: null };
  }

  const list = raw === null ? readList(legacyRaw, 1) : readList(raw, 2);
  const schema = conversationSchema(raw === null ? V1_READERS : V2_READERS);
  const conversations = sortByRecent(
    list.flatMap((value) => {
      const parsed = schema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  );
  const currentId = conversations.some((c) => c.id === current) ? current : null;
  return { conversations, currentId };
}

/**
 * 내역을 저장한다 (최신순 최대 MAX_CONVERSATIONS 개). 용량이 넘치면 오래된 대화부터 줄여 다시 시도한다.
 *
 * @returns 저장했으면 true (일부를 줄였어도 true), 저장할 수 없으면 false
 */
export function saveHistory(conversations: Conversation[]): boolean {
  let keep = sortByRecent(conversations).slice(0, MAX_CONVERSATIONS);
  for (;;) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 2, conversations: keep }));
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      return true;
    } catch (e) {
      if (!isQuotaError(e) || keep.length <= 1) {
        return false;
      }
      keep = keep.slice(0, Math.floor(keep.length * SHRINK_RATIO));
    }
  }
}

/** 마지막으로 보던 대화를 남긴다 (새로고침하면 다시 연다). null 이면 새 문의 화면 */
export function saveCurrentId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(CURRENT_KEY, id);
    } else {
      localStorage.removeItem(CURRENT_KEY);
    }
  } catch {
    // 저장이 안 되어도 화면은 동작한다
  }
}

/** 최신 활동순으로 정렬한 새 배열 */
export function sortByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readList(raw: string | null, version: number): unknown[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return isObject(parsed) && parsed.version === version && Array.isArray(parsed.conversations)
    ? parsed.conversations
    : [];
}

function conversationSchema(readers: MetaReaders): z.ZodType<Conversation> {
  const messageSchema = z
    .object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      status: z.enum(MESSAGE_STATUSES),
      createdAt: z.number(),
      stage: z.enum(STATUS_STAGES).optional().catch(undefined),
      classification: readers.classification,
      provider: z.enum(PROVIDERS).optional().catch(undefined),
      meta: readers.meta,
      error: z.object({ code: z.string(), message: z.string() }).optional().catch(undefined),
      finishedAt: z.number().optional().catch(undefined),
      regenerated: z.boolean().optional().catch(undefined),
    })
    .transform((m): Message => ({
      ...withoutUndefined(m),
      // 받는 도중 탭이 닫혔던 답변
      status: m.status === "pending" || m.status === "streaming" ? "stopped" : m.status,
    }));

  return z
    .object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
      updatedAt: z.number().optional(),
      messages: z.array(messageSchema),
    })
    .transform((c): Conversation => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      // updatedAt 이 없는 예전 저장본은 createdAt 으로 채운다
      updatedAt: c.updatedAt ?? c.createdAt,
      messages: c.messages,
    }));
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
