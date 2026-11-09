import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useStorage } from "./useStorage";
import {
  HISTORY_KEY,
  loadHistory,
  mergeSavedHistory,
  saveCurrentId,
  saveHistory,
  type LoadedHistory,
} from "../lib/history";

/** useChatHistory 가 돌려주는 내역 상태와 동작 */
export interface UseChatHistoryResult {
  /** 화면에 그리는 내역 */
  history: LoadedHistory;
  /** 가장 최근 내역. 핸들러 · 비동기 콜백이 커밋을 기다리지 않고 읽는다 */
  historyRef: RefObject<LoadedHistory>;
  /** 마지막 저장이 성공했는지 */
  isStorageOk: boolean;
  /**
   * 내역을 바꾼다.
   *
   * @param shouldSave 저장소에도 바로 쓴다. 곧 다시 저장할 변경은 쓰지 않는다
   */
  updateHistory: (change: (history: LoadedHistory) => LoadedHistory, shouldSave?: boolean) => void;
}

/**
 * 질문 내역을 저장소에서 불러와 들고 있고, 바꿀 때 저장한다. 마지막으로 보던 대화도 맞춰 남긴다.
 * 저장은 목록 전체를 덮어쓰므로, 다른 탭이 저장하면 바로 받아 와 그 탭의 대화를 지우지 않게 한다.
 */
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

  useEffect(
    () =>
      storage.subscribe((key) => {
        if (key === HISTORY_KEY || key === null) {
          updateHistory((h) => mergeSavedHistory(h, loadHistory(storage).conversations));
        }
      }),
    [storage, updateHistory],
  );

  return { history, historyRef, isStorageOk, updateHistory };
}
