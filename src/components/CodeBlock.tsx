import { isValidElement, useRef, type ReactNode } from "react";

import { CopyButton } from "./CopyButton";
import { copyText } from "../lib/clipboard";

/** 코드 블록: 언어 이름 + 복사 버튼 (하이라이팅은 아직 없음) */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const language = languageOf(children);

  return (
    <div className="not-prose my-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div
        className="flex items-center justify-between bg-zinc-100 px-3 py-1 text-xs text-zinc-500 dark:bg-zinc-900"
        data-copy-ignore=""
      >
        <span>{language ?? "코드"}</span>
        <CopyButton
          ariaLabel="코드 복사"
          onCopy={() => copyText((preRef.current?.textContent ?? "").replace(/\n$/, ""))}
        />
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto bg-zinc-50 p-3 text-[13px] leading-6 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
      >
        {children}
      </pre>
    </div>
  );
}

/** react-markdown 이 code 요소에 붙인 language-xxx 클래스에서 언어 이름을 꺼낸다 */
function languageOf(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(children)) {
    return null;
  }
  const match = /language-([\w+-]+)/.exec(children.props.className ?? "");
  return match?.[1] ?? null;
}
