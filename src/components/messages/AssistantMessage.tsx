import { memo, useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTypewriter } from "../../hooks/useTypewriter";
import { isReceiving, type Message } from "../../lib/chat";
import { copyRich } from "../../lib/clipboard";
import { closeOpenMarkdown, toCopyHtml, toPlainText } from "../../lib/markdown";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { MessageMeta } from "../MessageMeta";
import { ErrorMessage } from "./ErrorMessage";
import { StatusMessage } from "./StatusMessage";

/** 스크린 리더 완료 알림에 넣는 답변 앞부분 글자 수 */
const ANNOUNCE_PREVIEW_LENGTH = 80;

const SMALL_BUTTON_CLASS =
  "rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

interface AssistantMessageProps {
  message: Message;
  onRetry: (id: string) => void;
  /** 같은 문의를 같은 모델로 다시 보낸다 (대화 끝에 새 쌍으로) */
  onRegenerate: (id: string) => void;
  /** 다른 답변을 받는 중이면 다시 시도 · 다시 생성을 막는다 */
  isBusy: boolean;
  /** 스크린 리더에 한 번 알린다 (답변 완료 · 중지) */
  onAnnounce?: (text: string) => void;
}

/** AI 답변: 왼쪽 전체 폭. 마크다운 본문 + 복사 · 다시 생성 + 처리 과정 배지 */
export const AssistantMessage = memo(AssistantMessageView);

function AssistantMessageView({
  message,
  onRetry,
  onRegenerate,
  isBusy,
  onAnnounce,
}: AssistantMessageProps) {
  const isReducedMotion = useReducedMotion();
  // 화면에 있는 동안 답변을 받은 메시지만 흘려 보여 준다 (처음부터 완료 상태로 올라온 내역은 바로).
  // 한 번 받기 시작하면 끝난 뒤에도 유지해야 해서 파생값이 아니라 state 로 둔다
  const [isLive, setIsLive] = useState(() => isReceiving(message));
  if (!isLive && isReceiving(message)) {
    setIsLive(true);
  }
  const isInstant =
    !isLive || isReducedMotion || message.status === "stopped" || message.status === "error";
  const { text, caughtUp } = useTypewriter(message.content, isInstant, message.id);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 받는 중이거나, 다 받았어도 아직 흘리는 중이면 커서
  const isTyping = message.status === "streaming" || (message.status === "done" && !caughtUp);
  // 타이핑 중에는 닫히지 않은 서식(**, `, ```)을 임시로 닫아 그린다
  const shown = useMemo(() => (isTyping ? closeOpenMarkdown(text) : text), [isTyping, text]);
  const isDone = message.status === "done" && caughtUp;

  // 화면에서 받은 답변이 끝나면 한 번만 알린다 (오류는 ErrorMessage 의 role="alert" 가 알린다)
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!isLive || announcedRef.current || !onAnnounce) {
      return;
    }
    if (isDone) {
      announcedRef.current = true;
      const preview = Array.from(message.content).slice(0, ANNOUNCE_PREVIEW_LENGTH).join("");
      onAnnounce(`답변 완료: ${preview}`);
    } else if (message.status === "stopped") {
      announcedRef.current = true;
      onAnnounce("답변을 중지했습니다");
    }
  }, [isLive, isDone, message.status, message.content, onAnnounce]);
  useEffect(() => {
    if (isReceiving(message)) {
      announcedRef.current = false; // 다시 시도하면 다시 알린다
    }
  }, [message]);

  if (message.status === "pending") {
    return <StatusMessage stage={message.stage} since={message.createdAt} />;
  }

  const canCopy = (isDone || message.status === "stopped") && message.content.length > 0;
  const totalMs =
    message.finishedAt === undefined ? undefined : message.finishedAt - message.createdAt;

  function handleCopy(): Promise<boolean> {
    const el = bodyRef.current;
    return el ? copyRich(toCopyHtml(el), toPlainText(el)) : Promise.resolve(false);
  }

  return (
    <div className="space-y-2" aria-busy={isTyping || undefined}>
      <span className="sr-only">답변: </span>
      {shown ? (
        <Markdown ref={bodyRef} text={shown} isTyping={isTyping} />
      ) : (
        isTyping && <span className="typing-cursor" aria-hidden="true" />
      )}
      {message.status === "stopped" ? (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <span>중지됨</span>
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            disabled={isBusy}
            className="underline underline-offset-2 hover:text-zinc-800 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            다시 받기
          </button>
        </p>
      ) : null}
      {message.status === "error" && message.error ? (
        <ErrorMessage
          error={message.error}
          onRetry={() => onRetry(message.id)}
          isRetryDisabled={isBusy}
        />
      ) : null}
      {canCopy || isDone ? (
        <div className="-ml-2 flex flex-wrap items-center gap-1">
          {canCopy ? <CopyButton ariaLabel="답변 복사" onCopy={handleCopy} /> : null}
          {isDone ? (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              disabled={isBusy}
              aria-label="같은 문의로 답변 다시 생성"
              className={SMALL_BUTTON_CLASS}
            >
              다시 생성
            </button>
          ) : null}
        </div>
      ) : null}
      {isDone && message.meta ? (
        <MessageMeta
          meta={message.meta}
          classification={message.classification}
          totalMs={totalMs}
        />
      ) : null}
    </div>
  );
}
