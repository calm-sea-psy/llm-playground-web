import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "./useApi";
import { AnswerStreamError } from "../api/client";
import type { AnswerError, AnswerResponse, Provider } from "../api/types";
import {
  newConversation,
  newId,
  resendTargetOf,
  titleFrom,
  type Conversation,
  type Message,
} from "../lib/chat";
import { loadHistory, saveCurrentId, saveHistory, type LoadedHistory } from "../lib/history";

/** 삭제 뒤 실행 취소를 받을 수 있는 시간 */
export const UNDO_DELETE_MS = 5000;

const EMPTY: Message[] = [];

const UNKNOWN_ERROR: AnswerError = { code: "unknown", message: "알 수 없는 오류가 발생했습니다" };

interface DeletedConversation {
  conversation: Conversation;
  /** 지우기 전 목록 위치 (실행 취소 때 같은 자리로) */
  index: number;
}

interface UseChatOptions {
  /** 답변 요청이 network 오류로 실패했을 때 */
  onNetworkError?: () => void;
}

/** useChat 이 돌려주는 내역 상태와 동작 */
export interface UseChatResult {
  /** 문의를 한 번이라도 보낸 대화 (빈 새 문의는 넣지 않는다) */
  conversations: Conversation[];
  /** 보고 있는 대화. null 이면 빈 새 문의 화면 */
  currentId: string | null;
  /** 보고 있는 대화의 메시지 (새 문의 화면이면 빈 배열) */
  messages: Message[];
  /** 받는 중인 대화 id (null 이면 쉬는 중) */
  activeId: string | null;
  busy: boolean;
  /** 마지막 저장이 성공했는지 */
  storageOk: boolean;
  /** 방금 지워서 실행 취소할 수 있는 대화 */
  lastDeleted: Conversation | null;
  /** 보고 있는 대화에 문의를 보낸다. 받는 중이거나 빈 문의면 false */
  send: (text: string, provider: Provider) => boolean;
  /** 오류 · 중지된 답변을 같은 자리에서 다시 받는다 */
  retry: (assistantId: string) => void;
  /** 완료된 답변의 문의를 다시 보내 대화 끝에 새 쌍으로 붙인다. 받는 중이면 false */
  regenerate: (assistantId: string) => boolean;
  stop: () => void;
  /** 빈 새 문의 화면 (받던 답변은 원래 대화에서 계속 받는다) */
  newChat: () => void;
  select: (id: string) => void;
  /** 대화를 지운다 (받는 중인 대화는 지울 수 없다) */
  remove: (id: string) => void;
  undoRemove: () => void;
}

/**
 * 문의 내역 전체와 전송 · 중지 · 다시 시도 · 대화 전환 · 삭제.
 * - API 는 문의를 하나씩 독립적으로 처리한다 (같은 대화에서 다시 보내도 이전 맥락 없음)
 * - 요청은 한 번에 하나. 받는 도중 다른 대화로 옮겨도 답변은 원래 대화에서 계속 받는다
 * - localStorage 에는 보낸 직후 · done · 오류 · 중지 · 삭제 때만 쓴다 (delta 마다 쓰지 않음)
 */
export function useChat({ onNetworkError }: UseChatOptions = {}): UseChatResult {
  const api = useApi();
  const [history, setHistory] = useState<LoadedHistory>(loadHistory);
  const [storageOk, setStorageOk] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<DeletedConversation | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  /** 다음 커밋 뒤에 저장할지 (delta 같은 잦은 갱신은 저장하지 않는다) */
  const shouldSaveRef = useRef(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onNetworkErrorRef = useRef(onNetworkError);

  useEffect(() => {
    onNetworkErrorRef.current = onNetworkError;
  }, [onNetworkError]);

  useEffect(() => {
    historyRef.current = history;
    if (shouldSaveRef.current) {
      shouldSaveRef.current = false;
      setStorageOk(saveHistory(history.conversations));
    }
  }, [history]);

  useEffect(() => {
    saveCurrentId(history.currentId);
  }, [history.currentId]);

  // 정리할 때 받던 요청을 중지하지 않는다: 개발 모드 StrictMode 는 이펙트를 한 번 더 정리 · 실행하는데,
  // 첫 이펙트 처리가 늦으면(숨겨진 탭에서 막 열었을 때 등) 그사이 시작된 요청이 중지되었다.
  // 앱은 페이지를 닫을 때만 사라지고, 그때는 브라우저가 요청을 끊는다.
  useEffect(() => () => clearTimeout(undoTimerRef.current), []);

  /** 메시지 하나만 바꾼다 (나머지 메시지 객체는 그대로 → memo 된 컴포넌트는 다시 그리지 않는다). save 면 커밋 뒤 저장 */
  const updateMessage = useCallback(
    (conversationId: string, messageId: string, change: (m: Message) => Message, save = false) => {
      if (save) {
        shouldSaveRef.current = true;
      }
      setHistory((h) => ({
        ...h,
        conversations: h.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)) }
            : c,
        ),
      }));
    },
    [],
  );

  /** 대화의 assistantId 메시지에 text 의 답변을 받아 채운다 */
  const run = useCallback(
    async (conversationId: string, assistantId: string, text: string, provider: Provider) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setActiveId(conversationId);
      const update = (change: (m: Message) => Message, save = false): void => {
        updateMessage(conversationId, assistantId, change, save);
      };
      try {
        const res = await api.answerStream(
          { text, provider },
          {
            onStatus: (e) => update((m) => ({ ...m, stage: e.stage })),
            onClassification: (r) => update((m) => ({ ...m, classification: r })),
            onDelta: (t) => update((m) => ({ ...m, status: "streaming", content: m.content + t })),
          },
          controller.signal,
        );
        update((m) => finishWith(m, res), true);
      } catch (e) {
        if (e instanceof AnswerStreamError && e.code === "aborted") {
          update((m) => ({ ...m, status: "stopped", finishedAt: Date.now() }), true);
        } else {
          const error = toAnswerError(e);
          update((m) => ({ ...m, status: "error", error, finishedAt: Date.now() }), true);
          if (error.code === "network") {
            onNetworkErrorRef.current?.();
          }
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setActiveId(null);
        }
      }
    },
    [api, updateMessage],
  );

  const sendMessage = useCallback(
    (text: string, provider: Provider, regenerated: boolean): boolean => {
      const trimmed = text.trim();
      if (!trimmed || controllerRef.current) {
        return false;
      }
      const now = Date.now();
      const user: Message = {
        id: newId(),
        role: "user",
        content: trimmed,
        status: "done",
        createdAt: now,
        ...(regenerated && { regenerated: true }),
      };
      const assistant: Message = {
        id: newId(),
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: now,
        provider,
      };
      const { conversations, currentId } = historyRef.current;
      const existing = conversations.find((c) => c.id === currentId);
      const base = existing ?? newConversation();
      const conversation: Conversation = {
        ...base,
        title: base.title || titleFrom(trimmed),
        updatedAt: now,
        messages: [...base.messages, user, assistant],
      };
      shouldSaveRef.current = true; // 답변 도중 탭이 닫혀도 문의는 남도록
      setHistory((h) => ({
        currentId: conversation.id,
        conversations: existing
          ? h.conversations.map((c) => (c.id === conversation.id ? conversation : c))
          : [conversation, ...h.conversations],
      }));
      void run(conversation.id, assistant.id, trimmed, provider);
      return true;
    },
    [run],
  );

  const send = useCallback(
    (text: string, provider: Provider) => sendMessage(text, provider, false),
    [sendMessage],
  );

  const retry = useCallback(
    (assistantId: string) => {
      if (controllerRef.current) {
        return;
      }
      const conversation = currentConversation(historyRef.current);
      const target = conversation && resendTargetOf(conversation.messages, assistantId);
      if (!conversation || !target) {
        return;
      }
      updateMessage(conversation.id, assistantId, (m) => ({
        id: m.id,
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: Date.now(),
        provider: target.provider,
      }));
      void run(conversation.id, assistantId, target.question, target.provider);
    },
    [run, updateMessage],
  );

  const regenerate = useCallback(
    (assistantId: string) => {
      const conversation = currentConversation(historyRef.current);
      const target = conversation && resendTargetOf(conversation.messages, assistantId);
      return target ? sendMessage(target.question, target.provider, true) : false;
    },
    [sendMessage],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const newChat = useCallback(() => setHistory((h) => ({ ...h, currentId: null })), []);

  const select = useCallback((id: string) => setHistory((h) => ({ ...h, currentId: id })), []);

  const remove = useCallback(
    (id: string) => {
      if (id === activeId) {
        return;
      }
      const index = historyRef.current.conversations.findIndex((c) => c.id === id);
      if (index === -1) {
        return;
      }
      const conversation = historyRef.current.conversations[index];
      shouldSaveRef.current = true;
      setHistory((h) => ({
        currentId: h.currentId === id ? null : h.currentId,
        conversations: h.conversations.filter((c) => c.id !== id),
      }));
      setLastDeleted({ conversation, index });
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setLastDeleted(null), UNDO_DELETE_MS);
    },
    [activeId],
  );

  const undoRemove = useCallback(() => {
    if (!lastDeleted) {
      return;
    }
    const { conversation, index } = lastDeleted;
    shouldSaveRef.current = true;
    setHistory((h) => {
      if (h.conversations.some((c) => c.id === conversation.id)) {
        return h;
      }
      const conversations = [...h.conversations];
      conversations.splice(Math.min(index, conversations.length), 0, conversation);
      return { ...h, conversations };
    });
    setLastDeleted(null);
    clearTimeout(undoTimerRef.current);
  }, [lastDeleted]);

  return {
    conversations: history.conversations,
    currentId: history.currentId,
    messages: currentConversation(history)?.messages ?? EMPTY,
    activeId,
    busy: activeId !== null,
    storageOk,
    lastDeleted: lastDeleted?.conversation ?? null,
    send,
    retry,
    regenerate,
    stop,
    newChat,
    select,
    remove,
    undoRemove,
  };
}

function currentConversation({ conversations, currentId }: LoadedHistory): Conversation | null {
  return conversations.find((c) => c.id === currentId) ?? null;
}

/** done 응답으로 답변을 마무리한다 */
function finishWith(message: Message, res: AnswerResponse): Message {
  const finished = {
    ...message,
    finishedAt: Date.now(),
    meta: res,
    classification: res.classification ?? message.classification,
  };
  return res.status === "ok"
    ? { ...finished, status: "done", content: res.answer ?? message.content }
    : { ...finished, status: "error", error: res.error ?? UNKNOWN_ERROR };
}

function toAnswerError(e: unknown): AnswerError {
  if (e instanceof AnswerStreamError) {
    return { code: e.code, message: e.message };
  }
  return { code: "unknown", message: e instanceof Error ? e.message : String(e) };
}
