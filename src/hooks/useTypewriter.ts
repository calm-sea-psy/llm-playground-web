import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { TYPEWRITER_BASE_CPS, TYPEWRITER_CATCHUP_SEC } from "../lib/config";
import { TypewriterMemoryContext } from "../providers/typewriterMemoryContext";

/** 탭이 숨었다 돌아와도 한 번에 튀지 않게 자르는 프레임 간격 (초) */
const MAX_FRAME_SEC = 0.1;

/** useTypewriter 가 돌려주는 표시 상태 */
export interface TypewriterResult {
  /** 지금 보여 줄 글 */
  text: string;
  /** 받은 글을 끝까지 다 보여 줌 ("표시 완료". 커서 · 메타 표시 기준) */
  caughtUp: boolean;
}

/**
 * 받은 글(target)을 일정 속도로 흘려 보여 준다. delta 는 몰려서 도착하므로 버퍼처럼 쓴다.
 * - 속도 = max(기본 속도, 밀린 글자 / 따라잡는 시간) → 많이 밀리면 빨라진다
 * - instant 면 바로 전부 보여 준다 (중지 · 오류 · 움직임 줄이기 · 처음부터 완료된 메시지)
 * - 코드 포인트 단위로 자른다 (이모지가 반으로 잘리지 않게)
 *
 * @param memoryKey 표시 위치를 TypewriterMemoryProvider 에 기억할 키 (메시지 id). 없거나 Provider 밖이면 기억하지 않는다
 */
export function useTypewriter(
  target: string,
  instant: boolean,
  memoryKey?: string,
): TypewriterResult {
  const memory = useContext(TypewriterMemoryContext);
  const chars = useMemo(() => Array.from(target), [target]);
  const total = chars.length;
  const [shown, setShown] = useState(() => {
    const remembered = memoryKey === undefined ? undefined : memory?.get(memoryKey);
    return instant ? total : Math.min(total, remembered ?? 0);
  });

  const shownRef = useRef(shown);
  const totalRef = useRef(total);
  /** 도는 중인 애니메이션 프레임 (0 이면 멈춤). delta 마다 루프를 새로 시작하지 않으려고 둔다 */
  const frameRef = useRef(0);

  // 내용이 짧아지면 위치만 맞춘다 (done.answer 는 앞뒤 공백을 지운 값 · 다시 시도로 비워지면 0)
  if (total < shown) {
    setShown(total);
  }

  useEffect(() => {
    const remember = (value: number): void => {
      if (memoryKey !== undefined) {
        memory?.set(memoryKey, value);
      }
    };

    totalRef.current = total;
    if (shownRef.current > total) {
      shownRef.current = total;
      remember(total);
    }

    if (instant) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      shownRef.current = total; // 화면은 instant 일 때 state 와 상관없이 전부 보여 준다
      if (memoryKey !== undefined) {
        memory?.delete(memoryKey); // 끝난 메시지는 기억할 필요 없음
      }
      return;
    }
    if (frameRef.current || shownRef.current >= total) {
      return;
    }

    let last: number | null = null;
    let carry = 0; // 한 프레임에 1글자가 안 될 때 남은 소수

    const step = (now: number): void => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SEC);
      last = now;
      const backlog = totalRef.current - shownRef.current;
      carry += Math.max(TYPEWRITER_BASE_CPS, backlog / TYPEWRITER_CATCHUP_SEC) * dt;
      const add = Math.floor(carry);
      if (add > 0) {
        carry -= add;
        shownRef.current = Math.min(totalRef.current, shownRef.current + add);
        remember(shownRef.current);
        setShown(shownRef.current);
      }
      frameRef.current = shownRef.current < totalRef.current ? requestAnimationFrame(step) : 0;
    };
    frameRef.current = requestAnimationFrame(step);
  }, [instant, total, memoryKey, memory]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  const visible = instant ? total : Math.min(shown, total);
  return {
    text: visible === total ? target : chars.slice(0, visible).join(""),
    caughtUp: visible >= total,
  };
}
