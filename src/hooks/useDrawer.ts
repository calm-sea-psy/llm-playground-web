import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
    setIsOpenState(false);
    if (panelRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  }, []);

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
