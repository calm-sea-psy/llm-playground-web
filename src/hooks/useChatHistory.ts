import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useStorage } from "./useStorage";
import { loadHistory, saveCurrentId, saveHistory, type LoadedHistory } from "../lib/history";

/** useChatHistory 가 돌려주는 내역 상태와 동작 */
export interface UseChatHistoryResult {
  /** 화면에 그리는 내역 */
  history: LoadedHistory;
  /** 가장 최근 내역. 핸들러 · 스트림 콜백이 커밋을 기다리지 않고 읽는다 */
  historyRef: RefObject<LoadedHistory>;
  /** 마지막 저장이 성공했는지 */
  isStorageOk: boolean;
  /**
   * 내역을 바꾼다.
   *
   * @param shouldSave 저장소에도 바로 쓴다. delta 같은 잦은 갱신은 쓰지 않는다
   */
  updateHistory: (change: (history: LoadedHistory) => LoadedHistory, shouldSave?: boolean) => void;
}

/** 질문 내역을 저장소에서 불러와 들고 있고, 바꿀 때 저장한다. 마지막으로 보던 대화도 맞춰 남긴다 */
export function useChatHistory(): UseChatHistoryResult {
  const storage = useStorage();
  const [history, setHistory] = useState<LoadedHistory>(() => loadHistory(storage));
  const [isStorageOk, setIsStorageOk] = useState(true);
  const historyRef = useRef(history);

  const updateHistory = useCallback<UseChatHistoryResult["updateHistory"]>(
    (change, shouldSave = false) => {
      const next = change(historyRef.current);
      historyRef.current = next;
      setHistory(next);
      if (shouldSave) {
        setIsStorageOk(saveHistory(storage, next.conversations));
      }
    },
    [storage],
  );

  useEffect(() => {
    saveCurrentId(storage, history.currentId);
  }, [storage, history.currentId]);

  return { history, historyRef, isStorageOk, updateHistory };
}
