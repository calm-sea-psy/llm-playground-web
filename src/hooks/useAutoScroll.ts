import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { AUTO_SCROLL_THRESHOLD_PX } from "../lib/config";

const UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

/** useAutoScroll 이 돌려주는 ref 와 상태 */
export interface UseAutoScrollResult {
  /** 스크롤 컨테이너 (항상 렌더링되어 있어야 한다) */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 높이가 바뀌는 안쪽 요소 (항상 렌더링되어 있어야 한다) */
  contentRef: RefObject<HTMLDivElement | null>;
  /** 바닥에 붙어 내용을 따라가는 중인지 */
  isPinned: boolean;
  /** 바닥으로 이동하고 다시 따라가게 한다 (새 메시지 · "맨 아래로" 버튼) */
  scrollToBottom: (smooth?: boolean) => void;
}

/**
 * 바닥에 붙어 있을 때(pinned)만 내용이 늘어나는 대로 바닥을 따라간다.
 *
 * 사용자 개입 감지: 바닥 감시 요소의 보임 여부로는 판단하지 않는다 (글이 늘어날 때 잠깐 밀려나 오판).
 * 위로 굴린 휠 · 터치 끌기 · PageUp/↑/Home · 스크롤 위치가 줄어든 scroll(스크롤바 끌기)이 있고
 * 바닥에서 threshold 이상 떨어졌을 때만 멈춘다. 자동 스크롤은 위치를 늘리기만 하므로 오판하지 않는다.
 * 바닥 근처로 돌아오면 다시 켠다.
 *
 * @param threshold 바닥에서 이 거리(px) 이내면 바닥에 붙은 것으로 본다
 */
export function useAutoScroll(threshold = AUTO_SCROLL_THRESHOLD_PX): UseAutoScrollResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isPinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  /** ref(이벤트 처리용)와 state(화면용)를 함께 바꾼다 */
  const changeIsPinned = useCallback((value: boolean) => {
    isPinnedRef.current = value;
    setIsPinned(value);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) {
      return undefined;
    }

    let lastTop = el.scrollTop;
    let hasUserIntent = false;
    const distance = (): number => el.scrollHeight - el.scrollTop - el.clientHeight;

    const handleWheel = (e: WheelEvent): void => {
      if (e.deltaY < 0) {
        hasUserIntent = true;
      }
    };
    const handleTouchMove = (): void => {
      hasUserIntent = true;
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (UP_KEYS.has(e.key)) {
        hasUserIntent = true;
      }
    };
    const handleScroll = (): void => {
      const top = el.scrollTop;
      const wentUp = top < lastTop - 1;
      lastTop = top;
      if (distance() <= threshold) {
        hasUserIntent = false;
        if (!isPinnedRef.current) {
          changeIsPinned(true);
        }
      } else if ((hasUserIntent || wentUp) && isPinnedRef.current) {
        changeIsPinned(false);
      }
    };

    // 내용 높이가 바뀌면(타이핑 · 새 메시지) 붙어 있을 때만 바닥으로
    const observer = new ResizeObserver(() => {
      if (isPinnedRef.current) {
        el.scrollTop = el.scrollHeight;
        lastTop = el.scrollTop;
      }
    });
    observer.observe(content);

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("scroll", handleScroll);
    };
  }, [threshold, changeIsPinned]);

  const scrollToBottom = useCallback(
    (smooth = true) => {
      changeIsPinned(true);
      const el = containerRef.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    },
    [changeIsPinned],
  );

  return { containerRef, contentRef, isPinned, scrollToBottom };
}
