import { useEffect, useRef, useState } from "react";

/** "복사됨" 표시를 유지하는 시간 */
const FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

interface CopyButtonProps {
  /** 복사한다. 성공하면 true */
  onCopy: () => Promise<boolean>;
  /** 평소 버튼 글자 */
  label?: string;
  ariaLabel: string;
  className?: string;
}

/** 복사 버튼. 누르면 2초 동안 "복사됨 ✓" (스크린 리더에도 알림) */
export function CopyButton({ onCopy, label = "복사", ariaLabel, className = "" }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleClick(): Promise<void> {
    const isCopied = await onCopy();
    setState(isCopied ? "copied" : "failed");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  const text: Record<CopyState, string> = { idle: label, copied: "복사됨 ✓", failed: "복사 실패" };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      data-copy-ignore=""
      className={`rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
    >
      <span aria-live="polite">{text[state]}</span>
    </button>
  );
}
