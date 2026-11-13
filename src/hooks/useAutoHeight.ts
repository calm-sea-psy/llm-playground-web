import { useEffect, useLayoutEffect, type RefObject } from "react";

// 내용에 맞춰 높이를 맞춘다. maxHeightPx 를 넘으면 그 높이에서 안을 스크롤한다
function fitHeight(ref: RefObject<HTMLTextAreaElement | null>, maxHeightPx: number): void {
  const el = ref.current;
  if (!el) {
    return;
  }
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
}

/**
 * 여러 줄 입력창의 높이를 내용에 맞춘다. 글이 바뀔 때와 입력창 너비가 바뀔 때(창 크기 변경 · 화면 회전 ·
 * 숨긴 창에서 열었다가 보일 때) 다시 맞추고, maxHeightPx 를 넘으면 그 높이에서 입력창 안을 스크롤한다.
 *
 * @param value 입력창의 글. 바뀌면 다시 맞춘다
 */
export function useAutoHeight(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeightPx: number,
): void {
  useLayoutEffect(() => {
    fitHeight(ref, maxHeightPx);
  }, [ref, value, maxHeightPx]);

  // 너비가 바뀌면 줄 수가 달라지므로 높이를 다시 맞춘다
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      // 높이를 바꿔도 이 콜백이 불리므로 너비가 바뀐 때만 맞춘다
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fitHeight(ref, maxHeightPx);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, maxHeightPx]);
}
