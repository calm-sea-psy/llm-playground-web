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

interface AnswerActionsProps {
  canCopy: boolean;
  canRegenerate: boolean;
  isBusy: boolean;
  onCopy: () => Promise<boolean>;
  onRegenerate: () => void;
}

interface AnnounceOnceOptions {
  isLive: boolean;
  isDone: boolean;
  message: Message;
  onAnnounce: AssistantMessageProps["onAnnounce"];
}

/**
 * AI 답변: 왼쪽 전체 폭. 마크다운 본문 + 복사 · 다시 생성 + 처리 과정 배지.
 * 다시 받기는 createdAt 이 새로 찍혀 쓰는 쪽(ChatView)의 key 로 새로 만들어진다.
 */
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
  // 끝난 뒤에도 유지해야 해서 파생값으로 둘 수 없다. 만들어질 때 정해지고 바뀌지 않는다
  // eslint-disable-next-line react/hook-use-state -- setter 가 필요 없다
  const [isLive] = useState(() => isReceiving(message));
  const isInstant =
    !isLive || isReducedMotion || message.status === "stopped" || message.status === "error";
  const { text, isCaughtUp } = useTypewriter(message.content, isInstant, message.id);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 받는 중이거나, 다 받았어도 아직 흘리는 중이면 커서
  const isTyping = message.status === "streaming" || (message.status === "done" && !isCaughtUp);
  // 타이핑 중에는 닫히지 않은 서식(**, `, ```)을 임시로 닫아 그린다
  const shown = useMemo(() => (isTyping ? closeOpenMarkdown(text) : text), [isTyping, text]);
  const isDone = message.status === "done" && isCaughtUp;

  useAnnounceOnce({ isLive, isDone, message, onAnnounce });

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
      <AnswerActions
        canCopy={canCopy}
        canRegenerate={isDone}
        isBusy={isBusy}
        onCopy={handleCopy}
        onRegenerate={() => onRegenerate(message.id)}
      />
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

function AnswerActions({
  canCopy,
  canRegenerate,
  isBusy,
  onCopy,
  onRegenerate,
}: AnswerActionsProps) {
  if (!canCopy && !canRegenerate) {
    return null;
  }
  return (
    <div className="-ml-2 flex flex-wrap items-center gap-1">
      {canCopy ? <CopyButton ariaLabel="답변 복사" onCopy={onCopy} /> : null}
      {canRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isBusy}
          aria-label="같은 문의로 답변 다시 생성"
          className={SMALL_BUTTON_CLASS}
        >
          다시 생성
        </button>
      ) : null}
    </div>
  );
}

/** 화면에서 받은 답변이 끝나면 한 번만 알린다 (오류는 ErrorMessage 의 role="alert" 가 알린다) */
function useAnnounceOnce({ isLive, isDone, message, onAnnounce }: AnnounceOnceOptions): void {
  const hasAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!isLive || hasAnnouncedRef.current || !onAnnounce) {
      return;
    }
    if (isDone) {
      hasAnnouncedRef.current = true;
      const preview = Array.from(message.content).slice(0, ANNOUNCE_PREVIEW_LENGTH).join("");
      onAnnounce(`답변 완료: ${preview}`);
    } else if (message.status === "stopped") {
      hasAnnouncedRef.current = true;
      onAnnounce("답변을 중지했습니다");
    }
  }, [isLive, isDone, message.status, message.content, onAnnounce]);
}
