import { useEffect, useRef, useState } from "react";

import { logWarning } from "../lib/logger";

/** "복사됨" 표시를 유지하는 시간 */
const FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

const STATE_TEXT: Record<CopyState, string> = {
  idle: "복사",
  copied: "복사됨 ✓",
  failed: "복사 실패",
};

interface CopyButtonProps {
  /** 복사한다. 성공하면 true */
  onCopy: () => Promise<boolean>;
  ariaLabel: string;
}

/** 복사 버튼. 누르면 2초 동안 "복사됨 ✓" (스크린 리더에도 알림) */
export function CopyButton({ onCopy, ariaLabel }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleClick(): Promise<void> {
    let isCopied = false;
    try {
      isCopied = await onCopy();
    } catch (e) {
      logWarning("복사 실패", e);
    }
    setState(isCopied ? "copied" : "failed");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      data-copy-ignore=""
      className="rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      <span aria-live="polite">{STATE_TEXT[state]}</span>
    </button>
  );
}
