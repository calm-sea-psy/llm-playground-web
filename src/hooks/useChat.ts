import { useCallback, useRef, useState } from "react";

import { useApi } from "./useApi";
import { useChatHistory } from "./useChatHistory";
import { useUndoDelete } from "./useUndoDelete";
import { QueryError } from "../api/client";
import type { QueryResponse, RetrievalMode } from "../api/types";
import {
  newConversation,
  newId,
  resendTargetOf,
  titleFrom,
  type AnswerError,
  type Conversation,
  type Message,
} from "../lib/chat";
import type { LoadedHistory } from "../lib/history";
import { logWarning } from "../lib/logger";

const EMPTY: Message[] = [];

/** 이 오류로 실패하면 사이드바의 서버 상태도 틀렸을 수 있어 다시 확인하게 한다 */
const SERVER_TROUBLE_CODES = new Set<string>(["network", "timeout", "index_not_ready"]);

interface UseChatOptions {
  /** 질문이 서버 쪽 문제(연결 실패 · 시간 초과 · 인덱스 미준비)로 실패했을 때. 받는 도중에 바뀌지 않게 고정된 함수를 넘긴다 */
  onServerTrouble?: () => void;
}

/** useChat 이 돌려주는 내역 상태와 동작 */
export interface UseChatResult {
  /** 질문을 한 번이라도 보낸 대화 (빈 새 질문은 넣지 않는다) */
  conversations: Conversation[];
  /** 보고 있는 대화. 없으면 빈 새 질문 화면 */
  currentId: string | undefined;
  /** 보고 있는 대화의 메시지 (새 질문 화면이면 빈 배열) */
  messages: Message[];
  /** 받는 중인 대화 id (없으면 쉬는 중) */
  activeId: string | undefined;
  isBusy: boolean;
  /** 마지막 저장이 성공했는지 */
  isStorageOk: boolean;
  /** 방금 지워서 실행 취소할 수 있는 대화 */
  lastDeleted: Conversation | undefined;
  /** 보고 있는 대화에 질문을 보낸다. 받는 중이거나 빈 질문이면 false */
  send: (text: string, retrievalMode: RetrievalMode) => boolean;
  /** 오류 · 중지된 답변을 같은 자리에서 다시 받는다 */
  retry: (assistantId: string) => void;
  stop: () => void;
  /** 빈 새 질문 화면 = 다음 질문부터 새 세션 (받던 답변은 원래 대화에서 계속 받는다) */
  newChat: () => void;
  select: (id: string) => void;
  /** 대화를 지운다 (받는 중인 대화는 지울 수 없다) */
  remove: (id: string) => void;
  undoRemove: () => void;
}

/**
 * 질문 내역 전체와 전송 · 중지 · 다시 시도 · 대화 전환 · 삭제.
 * - 대화 하나 = 서버 세션 하나. 첫 질문 때 세션 id 를 받아 대화에 저장하고, 이후 질문은 같은 id 로 보낸다
 *   (내역에서 예전 대화를 골라 이어 물어도 그 대화의 세션으로 간다)
 * - 요청은 한 번에 하나. 받는 도중 다른 대화로 옮겨도 답변은 원래 대화에서 계속 받는다
 * - 저장소에는 질문을 보낼 때(새 대화는 세션 id 를 받은 때) · 응답 · 오류 · 중지 · 삭제 때 쓴다
 */
export function useChat({ onServerTrouble }: UseChatOptions = {}): UseChatResult {
  const api = useApi();
  const { history, historyRef, isStorageOk, updateHistory } = useChatHistory();
  const {
    lastDeleted,
    remove: removeConversation,
    undoRemove,
  } = useUndoDelete({ historyRef, updateHistory });
  const [activeId, setActiveId] = useState<string>();

  // 언마운트 때 받던 요청을 중지하지 않는다: 개발 모드 StrictMode 는 이펙트를 한 번 더 정리 · 실행하는데,
  // 첫 이펙트 처리가 늦으면(숨겨진 탭에서 막 열었을 때 등) 그사이 시작된 요청이 중지되었다.
  // 앱은 페이지를 닫을 때만 사라지고, 그때는 브라우저가 요청을 끊는다.
  const controllerRef = useRef<AbortController>(undefined);

  /** 메시지 하나만 바꾸고 대화의 마지막 활동 시각을 맞춘다 (나머지 메시지 객체는 그대로 → memo 된 컴포넌트는 다시 그리지 않는다) */
  const updateMessage = useCallback(
    (
      conversationId: string,
      messageId: string,
      change: (m: Message) => Message,
      shouldSave = false,
    ) => {
      updateHistory(
        (h) => ({
          ...h,
          conversations: h.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)),
                }
              : c,
          ),
        }),
        shouldSave,
      );
    },
    [updateHistory],
  );

  /** 대화의 세션 id. 없으면 새로 받아 대화에 저장한다 */
  const sessionOf = useCallback(
    async (conversationId: string, signal: AbortSignal): Promise<string> => {
      const existing = historyRef.current.conversations.find(
        (c) => c.id === conversationId,
      )?.sessionId;
      if (existing) {
        return existing;
      }
      const sessionId = await api.createSession(signal);
      updateHistory(
        (h) => ({
          ...h,
          conversations: h.conversations.map((c) =>
            c.id === conversationId ? { ...c, sessionId } : c,
          ),
        }),
        true,
      );
      return sessionId;
    },
    [api, historyRef, updateHistory],
  );

  /** 대화의 assistantId 메시지에 question 의 답변을 받아 채운다 */
  const run = useCallback(
    async (
      conversationId: string,
      assistantId: string,
      question: string,
      retrievalMode: RetrievalMode,
    ) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setActiveId(conversationId);
      const update = (change: (m: Message) => Message): void => {
        updateMessage(conversationId, assistantId, change, true);
      };
      try {
        const sessionId = await sessionOf(conversationId, controller.signal);
        const res = await api.query({ question, retrievalMode, sessionId }, controller.signal);
        if (res.status === "error") {
          // error_code 는 로그용. 화면에는 코드별 사용자용 안내만 보인다
          logWarning("서버가 오류로 답했다", {
            requestId: res.requestId,
            errorCode: res.errorCode,
            reason: res.reason,
          });
        }
        update((m) => finishWith(m, res));
        if (res.errorCode && SERVER_TROUBLE_CODES.has(res.errorCode)) {
          onServerTrouble?.();
        }
      } catch (e) {
        if (e instanceof QueryError && e.code === "aborted") {
          update((m) => ({ ...m, status: "stopped", finishedAt: Date.now() }));
        } else {
          logWarning("질문 요청 실패", e); // 화면에는 code 별 안내만 남아 원본은 여기서 본다
          const error = toAnswerError(e);
          update((m) => ({ ...m, status: "error", error, finishedAt: Date.now() }));
          if (SERVER_TROUBLE_CODES.has(error.code)) {
            onServerTrouble?.();
          }
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = undefined;
          setActiveId(undefined);
        }
      }
    },
    [api, sessionOf, updateMessage, onServerTrouble],
  );

  const send = useCallback(
    (text: string, retrievalMode: RetrievalMode): boolean => {
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
      };
      const assistant: Message = {
        id: newId(),
        role: "assistant",
        content: "",
        status: "pending",
        createdAt: now,
        retrievalMode,
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
      // 답변 도중 탭이 닫혀도 질문은 남도록 바로 저장한다. 세션이 없으면 sessionOf 가 id 를 받아 함께 저장한다
      // (내역 전체를 쓰는 일이라 같은 내용을 두 번 쓰지 않는다)
      updateHistory(
        (h) => ({
          currentId: conversation.id,
          conversations: existing
            ? h.conversations.map((c) => (c.id === conversation.id ? conversation : c))
            : [conversation, ...h.conversations],
        }),
        conversation.sessionId !== undefined,
      );
      void run(conversation.id, assistant.id, trimmed, retrievalMode);
      return true;
    },
    [historyRef, run, updateHistory],
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
        // 화면은 이 값이 바뀌는 것을 보고 메시지를 새로 만든다 (ChatView 의 key). 같은 ms 여도 반드시 바꾼다
        createdAt: Math.max(Date.now(), m.createdAt + 1),
        retrievalMode: target.retrievalMode,
      }));
      void run(conversation.id, assistantId, target.question, target.retrievalMode);
    },
    [historyRef, run, updateMessage],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const newChat = useCallback(
    () => updateHistory((h) => ({ ...h, currentId: undefined })),
    [updateHistory],
  );

  const select = useCallback(
    (id: string) => updateHistory((h) => ({ ...h, currentId: id })),
    [updateHistory],
  );

  const remove = useCallback(
    (id: string) => {
      if (id !== activeId) {
        removeConversation(id);
      }
    },
    [activeId, removeConversation],
  );

  return {
    conversations: history.conversations,
    currentId: history.currentId,
    messages: currentConversation(history)?.messages ?? EMPTY,
    activeId,
    isBusy: activeId !== undefined,
    isStorageOk,
    lastDeleted,
    send,
    retry,
    stop,
    newChat,
    select,
    remove,
    undoRemove,
  };
}

function currentConversation({
  conversations,
  currentId,
}: LoadedHistory): Conversation | undefined {
  return conversations.find((c) => c.id === currentId);
}

/** 응답으로 답변을 마무리한다. 서버 status 가 "error" 면 오류 메시지, 나머지 셋은 done */
function finishWith(message: Message, res: QueryResponse): Message {
  const finished = { ...message, finishedAt: Date.now(), response: res };
  return res.status === "error"
    ? {
        ...finished,
        status: "error",
        // 계약상 status=error 면 error_code 가 반드시 있다 (schemas.ts 가 검사). 그래도 없으면 일반 안내
        error: { code: res.errorCode ?? "unknown", message: res.reason },
      }
    : { ...finished, status: "done", content: res.answer };
}

function toAnswerError(e: unknown): AnswerError {
  if (e instanceof QueryError) {
    return { code: e.code, message: e.message };
  }
  return { code: "unknown", message: e instanceof Error ? e.message : String(e) };
}
