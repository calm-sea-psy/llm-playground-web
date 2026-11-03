import { useCallback, useEffect, useRef, useState } from "react";

import type { UseChatHistoryResult } from "./useChatHistory";
import type { Conversation } from "../lib/chat";

/** 삭제 뒤 실행 취소를 받을 수 있는 시간 */
export const UNDO_DELETE_MS = 5000;

interface DeletedConversation {
  conversation: Conversation;
  /** 지우기 전 목록 위치 (실행 취소 때 같은 자리로) */
  index: number;
}

/** useUndoDelete 가 돌려주는 삭제 상태와 동작 */
export interface UseUndoDeleteResult {
  /** 방금 지워서 실행 취소할 수 있는 대화 */
  lastDeleted: Conversation | undefined;
  /** 대화를 지우고 UNDO_DELETE_MS 동안 실행 취소를 받는다. 없는 id 면 아무 일도 없다 */
  remove: (id: string) => void;
  /** 방금 지운 대화를 원래 자리로 되돌린다 */
  undoRemove: () => void;
}

/** 대화 삭제와 실행 취소 */
export function useUndoDelete({
  historyRef,
  updateHistory,
}: Pick<UseChatHistoryResult, "historyRef" | "updateHistory">): UseUndoDeleteResult {
  const [lastDeleted, setLastDeleted] = useState<DeletedConversation>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const remove = useCallback(
    (id: string) => {
      const index = historyRef.current.conversations.findIndex((c) => c.id === id);
      const conversation = historyRef.current.conversations.at(index);
      if (index === -1 || !conversation) {
        return;
      }
      updateHistory(
        (h) => ({
          currentId: h.currentId === id ? undefined : h.currentId,
          conversations: h.conversations.filter((c) => c.id !== id),
        }),
        true,
      );
      setLastDeleted({ conversation, index });
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setLastDeleted(undefined), UNDO_DELETE_MS);
    },
    [historyRef, updateHistory],
  );

  const undoRemove = useCallback(() => {
    if (!lastDeleted) {
      return;
    }
    const { conversation, index } = lastDeleted;
    updateHistory((h) => {
      if (h.conversations.some((c) => c.id === conversation.id)) {
        return h;
      }
      const conversations = [...h.conversations];
      conversations.splice(Math.min(index, conversations.length), 0, conversation);
      return { ...h, conversations };
    }, true);
    setLastDeleted(undefined);
    clearTimeout(timerRef.current);
  }, [lastDeleted, updateHistory]);

  return { lastDeleted: lastDeleted?.conversation, remove, undoRemove };
}
