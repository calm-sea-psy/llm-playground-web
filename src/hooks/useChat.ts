import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useApi } from "./useApi";
import { useChatHistory } from "./useChatHistory";
import { useStorage } from "./useStorage";
import { useUndoDelete, type DeletedConversation } from "./useUndoDelete";
import { RequestError, type RequestErrorCode } from "../api/client";
import type { AskMode, AskProgress, AskRequest } from "../api/types";
import {
  newId,
  stateFromEnd,
  withAnswerProgress,
  withAnswerState,
  withQuestion,
  type AnswerState,
  type Conversation,
  type Message,
} from "../lib/chat";
import { saveCurrentId, type SaveResult } from "../lib/history";
import { logWarning } from "../lib/logger";

/** 새 대화 화면의 메시지. 렌더마다 새 배열을 만들지 않는다 */
const NO_MESSAGES: Message[] = [];

/** 서버 상태를 다시 확인할 실패: 서버에 닿지 못했거나, 받다가 끊겼거나, 서버가 오래 말이 없었다 */
const SERVER_TROUBLE: readonly RequestErrorCode[] = ["network", "interrupted", "timeout"];

/** 답을 받는 요청 하나 (POST /ask) */
interface AskVariables {
  /** 답을 받는 대화 */
  conversationId: string;
  request: AskRequest;
  /** 진행 이벤트를 받을 때마다 */
  onProgress: (event: AskProgress) => void;
  /** 사용자가 중지하면 끊는다 */
  signal: AbortSignal;
}

/** useChat 설정 */
export interface UseChatOptions {
  /** 질문이 서버 문제(연결 실패 · 끊김 · 시간 초과)로 실패했을 때. 서버 상태를 바로 다시 확인하는 데 쓴다 */
  onServerTrouble?: () => void;
}

/** useChat 이 돌려주는 대화 목록 상태와 동작 */
export interface UseChatResult {
  /** 질문을 한 번이라도 보낸 대화 */
  conversations: Conversation[];
  /** 보고 있는 대화. 없으면 새 대화 화면 */
  currentId: string | undefined;
  /** 보고 있는 대화의 메시지 */
  messages: Message[];
  /** 답변을 받는 중인 대화. 요청은 한 번에 하나다 */
  activeId: string | undefined;
  /** 답변을 받는 중 (어느 대화든) */
  isBusy: boolean;
  /** 마지막 저장 결과 */
  saveResult: SaveResult;
  /** 지운 뒤 아직 실행 취소를 받는 대화들 (지운 순서) */
  recentlyDeleted: DeletedConversation[];
  /** 보고 있는 대화에 질문을 보낸다. 받는 중이거나 빈 질문이면 보내지 않고 false */
  send: (question: string, mode: AskMode) => boolean;
  /** 받는 중인 답변을 멈춘다. 받은 만큼은 남는다 */
  stop: () => void;
  /** 새 대화 화면. 받던 답변은 원래 대화에서 계속 받는다 */
  newChat: () => void;
  /** 다른 대화를 연다 */
  select: (id: string) => void;
  /** 대화를 지운다. 받는 중인 대화는 지우지 않는다 */
  remove: (id: string) => void;
  /** 지운 대화 하나를 되돌린다. 실행 취소 시간이 지났으면 아무 일도 없다 */
  undoRemove: (id: string) => void;
}

/**
 * 대화 목록과 보내기 · 중지 · 대화 전환 · 삭제.
 * - 대화는 브라우저에만 있다. 서버(/ask)는 질문마다 따로 답하고 앞 대화를 기억하지 않는다
 * - 답은 이벤트가 올 때마다 화면에 더한다. 저장소에는 보낼 때와 끝날 때만 쓴다 (조각마다 쓰지 않는다)
 */
export function useChat({ onServerTrouble }: UseChatOptions = {}): UseChatResult {
  const api = useApi();
  const storage = useStorage();
  const { history, historyRef, saveResult, updateHistory } = useChatHistory();
  const {
    recentlyDeleted,
    remove: removeConversation,
    undoRemove,
  } = useUndoDelete({ historyRef, updateHistory });
  // 답을 받는 요청. 받는 중인 대화(activeId)는 이 요청 상태에서 읽는다
  const ask = useMutation({
    mutationFn: ({ request, onProgress, signal }: AskVariables) =>
      api.ask(request, onProgress, signal),
    // 브라우저가 오프라인이라고 해도 멈추지 않고 network 오류로 끝낸다
    networkMode: "always",
  });
  // 중지할 요청. 같은 렌더 안에서 두 번 불려도 한 번만 보내도록 보내기 여부도 이것으로 본다
  const controllerRef = useRef<AbortController | null>(null);

  const current = history.conversations.find((c) => c.id === history.currentId);
  // 목록에 없는 대화(저장에 실패한 채 새로고침 등)는 새 대화 화면으로 연다
  const currentId = current?.id;
  const activeId = ask.isPending ? ask.variables.conversationId : undefined;

  useEffect(() => {
    saveCurrentId(storage, currentId);
  }, [storage, currentId]);

  function finish(conversationId: string, answerId: string, next: AnswerState): void {
    updateHistory(
      (h) => ({
        ...h,
        conversations: withAnswerState(h.conversations, conversationId, answerId, next, Date.now()),
      }),
      true,
    );
  }

  async function receive(
    conversationId: string,
    answerId: string,
    request: AskRequest,
    controller: AbortController,
  ): Promise<void> {
    // 조각마다 다시 그리되 저장하지는 않는다 (끝날 때 finish 가 저장한다)
    const onProgress = (event: AskProgress): void => {
      updateHistory((h) => ({
        ...h,
        conversations: withAnswerProgress(h.conversations, conversationId, answerId, event),
      }));
    };
    try {
      const end = await ask.mutateAsync({
        conversationId,
        request,
        onProgress,
        signal: controller.signal,
      });
      if (end.event === "error") {
        logWarning(`서버가 답을 못 만들었다고 알렸다 (${end.code})`);
      }
      finish(conversationId, answerId, stateFromEnd(end));
    } catch (e) {
      const code = e instanceof RequestError ? e.code : "bad_response";
      if (code === "aborted") {
        finish(conversationId, answerId, { state: "stopped" });
      } else {
        logWarning("질문 요청이 실패했다", e);
        finish(conversationId, answerId, { state: "failed", failure: code });
        if (SERVER_TROUBLE.includes(code)) {
          onServerTrouble?.();
        }
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }

  function send(question: string, mode: AskMode): boolean {
    const text = question.trim();
    if (text === "" || controllerRef.current !== null) {
      return false;
    }
    const id = currentId ?? newId();
    const answerId = newId();
    const conversation = withQuestion(
      historyRef.current.conversations.find((c) => c.id === id),
      { conversationId: id, questionId: newId(), answerId, text, mode, now: Date.now() },
    );
    // 답을 받는 도중 탭이 닫혀도 질문은 남도록 바로 저장한다
    updateHistory(
      (h) => ({
        currentId: id,
        conversations: [conversation, ...h.conversations.filter((c) => c.id !== id)],
      }),
      true,
    );
    const controller = new AbortController();
    controllerRef.current = controller;
    void receive(id, answerId, { question: text, mode }, controller);
    return true;
  }

  function stop(): void {
    controllerRef.current?.abort();
  }

  function newChat(): void {
    updateHistory((h) => ({ ...h, currentId: undefined }));
  }

  // select · remove 는 memo 된 HistoryList 에 넘기므로 렌더마다 새로 만들지 않는다 (입력할 때마다 목록을 다시 그리지 않게)
  const select = useCallback(
    (id: string) => {
      if (id !== historyRef.current.currentId) {
        updateHistory((h) => ({ ...h, currentId: id }));
      }
    },
    [historyRef, updateHistory],
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
    currentId,
    messages: current?.messages ?? NO_MESSAGES,
    activeId,
    isBusy: activeId !== undefined,
    saveResult,
    recentlyDeleted,
    send,
    stop,
    newChat,
    select,
    remove,
    undoRemove,
  };
}
