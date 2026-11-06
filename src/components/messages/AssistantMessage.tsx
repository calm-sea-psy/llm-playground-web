import { memo, useEffect, useRef, useState } from "react";

import { isReceiving, type Message } from "../../lib/chat";
import { copyRich } from "../../lib/clipboard";
import { toCopyHtml, toPlainText } from "../../lib/markdown";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import { MessageMeta } from "../MessageMeta";
import { AnswerCard } from "./AnswerCard";
import { ErrorMessage } from "./ErrorMessage";
import { StatusMessage } from "./StatusMessage";

/** 스크린 리더 완료 알림에 넣는 답변 앞부분 글자 수 */
const ANNOUNCE_PREVIEW_LENGTH = 80;

/** 응답 상태별 완료 알림 머리말 */
const ANNOUNCE_PREFIX = {
  answered: "답변 완료",
  needs_clarification: "확인 질문",
  abstained: "답변 보류",
  error: "오류",
} as const;

interface AssistantMessageProps {
  message: Message;
  /** 오류 · 중지된 답변을 같은 자리에서 다시 받는다 */
  onRetry: (id: string) => void;
  /** 확인 질문에서 "조건 보완해서 묻기"를 눌렀을 때 (입력창으로 옮긴다) */
  onClarify?: () => void;
  /** 다른 답변을 받는 중이면 다시 시도를 막는다 */
  isBusy: boolean;
  /** 스크린 리더에 한 번 알린다 (답변 완료 · 중지) */
  onAnnounce?: (text: string) => void;
}

interface AnnounceOnceOptions {
  isLive: boolean;
  message: Message;
  onAnnounce: AssistantMessageProps["onAnnounce"];
}

/**
 * AI 답변: 기다리는 중 → 상태별 답변 카드(결론 · 근거 · 출처) 또는 오류 안내, 아래에 복사 · 메타.
 * 다시 받기는 createdAt 이 새로 찍혀 쓰는 쪽(ChatView)의 key 로 새로 만들어진다.
 */
export const AssistantMessage = memo(AssistantMessageView);

function AssistantMessageView({
  message,
  onRetry,
  onClarify,
  isBusy,
  onAnnounce,
}: AssistantMessageProps) {
  // 화면에 있는 동안 응답을 받은 메시지만 알린다 (처음부터 끝난 상태로 올라온 내역은 알리지 않음).
  // 만들어질 때 정해지고 바뀌지 않는다
  // eslint-disable-next-line react/hook-use-state -- setter 가 필요 없다
  const [isLive] = useState(() => isReceiving(message));
  const bodyRef = useRef<HTMLDivElement>(null);

  useAnnounceOnce({ isLive, message, onAnnounce });

  if (message.status === "pending") {
    return <StatusMessage since={message.createdAt} />;
  }

  const { response } = message;
  const isDone = message.status === "done";
  const totalMs =
    message.finishedAt === undefined ? undefined : message.finishedAt - message.createdAt;

  function handleCopy(): Promise<boolean> {
    const el = bodyRef.current;
    return el ? copyRich(toCopyHtml(el), toPlainText(el)) : Promise.resolve(false);
  }

  return (
    <div className="space-y-2">
      <span className="sr-only">답변: </span>
      {isDone && response ? (
        <AnswerCard ref={bodyRef} response={response} onClarify={onClarify} />
      ) : null}
      {/* 저장본의 메타가 형식 검사에서 버려진 답변: 본문 글만이라도 보인다 */}
      {isDone && !response ? <Markdown ref={bodyRef} text={message.content} /> : null}
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
      {isDone && response ? (
        <div className="-ml-2">
          <CopyButton ariaLabel="답변 복사" onCopy={handleCopy} />
        </div>
      ) : null}
      {response ? <MessageMeta response={response} totalMs={totalMs} /> : null}
    </div>
  );
}

/** 화면에서 받은 답변이 끝나면 한 번만 알린다 (오류는 ErrorMessage 의 role="alert" 가 알린다) */
function useAnnounceOnce({ isLive, message, onAnnounce }: AnnounceOnceOptions): void {
  const hasAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!isLive || hasAnnouncedRef.current || !onAnnounce) {
      return;
    }
    if (message.status === "done" && message.response) {
      hasAnnouncedRef.current = true;
      const preview = Array.from(message.content).slice(0, ANNOUNCE_PREVIEW_LENGTH).join("");
      onAnnounce(`${ANNOUNCE_PREFIX[message.response.status]}: ${preview}`);
    } else if (message.status === "stopped") {
      hasAnnouncedRef.current = true;
      onAnnounce("답변을 중지했습니다");
    }
  }, [isLive, message.status, message.response, message.content, onAnnounce]);
}
