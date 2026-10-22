import { useCallback, useSyncExternalStore } from "react";

/**
 * CSS 미디어 쿼리가 맞는지. 바뀌면 다시 그린다.
 *
 * @param fallback matchMedia 가 없는 환경(테스트 · 서버 렌더)에서 돌려줄 값
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) {
        return noop;
      }
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = (): boolean =>
    hasMatchMedia() ? window.matchMedia(query).matches : fallback;
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === "function";
}

function noop(): void {
  // 구독할 것이 없다
}
