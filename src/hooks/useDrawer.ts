import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

import { useMediaQuery } from "./useMediaQuery";

/** 이 너비 미만이면 사이드바를 덮개(drawer)로 */
const DESKTOP_QUERY = "(min-width: 768px)";

/** useDrawer 가 돌려주는 덮개 상태와 동작 */
export interface UseDrawerResult {
  /** 좁은 화면이라 사이드바가 덮개로 동작하는지 */
  isDrawer: boolean;
  /** 덮개가 열려 있는지 (넓은 화면에서는 항상 false) */
  isOpen: boolean;
  open: () => void;
  /** 닫는다. 덮개 안에 포커스가 있었으면 여는 버튼으로 돌려준다 */
  close: () => void;
  /** 덮개 요소 */
  panelRef: RefObject<HTMLDivElement | null>;
  /** 덮개를 여는 버튼 */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/** 좁은 화면의 사이드바 덮개: 열면 첫 버튼으로 포커스, Esc 로 닫기 */
export function useDrawer(): UseDrawerResult {
  const isDrawer = !useMediaQuery(DESKTOP_QUERY, true);
  const [isOpenState, setIsOpenState] = useState(false);
  const isOpen = isDrawer && isOpenState;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(() => setIsOpenState(true), []);

  const close = useCallback(() => {
    const hadFocus = panelRef.current?.contains(document.activeElement);
    // 여는 버튼은 덮개가 열린 동안 inert 인 <main> 안에 있어 포커스를 받지 못한다. 먼저 닫아 inert 를 푼다
    flushSync(() => setIsOpenState(false));
    if (hadFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  // 넓은 화면이 되면 덮개 상태를 지운다. 안 지우면 다시 좁아질 때 저절로 열린다
  useEffect(() => {
    if (!isDrawer) {
      return undefined;
    }
    return () => setIsOpenState(false);
  }, [isDrawer]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  return { isDrawer, isOpen, open, close, panelRef, triggerRef };
}
