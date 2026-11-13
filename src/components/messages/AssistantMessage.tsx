import { AnswerText } from "./AnswerText";
import { ErrorMessage } from "./ErrorMessage";
import type { StageName } from "../../api/types";
import { usePendingIndicator } from "../../hooks/usePendingIndicator";
import type { AnswerMessage } from "../../lib/chat";
import {
  ASK_MODE_NAMES,
  CUT_TEXT,
  PARTIAL_NOTE,
  REQUEST_ERROR_TEXT,
  WAITING_TEXT,
  errorEventText,
} from "../../lib/labels";
import { SealStudy } from "../seal/SealStudy";
import { Sources } from "../Sources";

interface AssistantMessageProps {
  message: AnswerMessage;
}

/** partial 단계로 답했는지 (단계 이름이 계약 값과 같을 때만). 계약에서 이 이름이 빠지면 타입 오류가 난다 */
const PARTIAL_STAGE: StageName = "partial";

// 기다리는 표시의 높이. 표시를 보이기 전에도 같은 높이로 자리를 잡아 둔다
const PENDING_HEIGHT_CLASS = "h-16";

interface PendingMessageProps {
  /** 서버의 단계 안내 문구. 아직 없으면 대기 문구 */
  text: string;
}

function PendingMessage({ text }: PendingMessageProps) {
  return (
    <div className={`flex ${PENDING_HEIGHT_CLASS} items-center gap-3`}>
      <SealStudy motion="always" className="size-16 shrink-0" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
    </div>
  );
}

// 답 아래 한 줄 안내: 답변 방식(에이전트일 때) · partial 로 답함
function notesOf(message: AnswerMessage): string[] {
  const notes = message.mode === "agent" ? [`${ASK_MODE_NAMES.agent}로 답함`] : [];
  return message.state === "done" && message.answer.stage?.name === PARTIAL_STAGE
    ? [...notes, PARTIAL_NOTE]
    : notes;
}

interface AnswerStatusProps {
  message: AnswerMessage;
}

// 답이 끝난 모양: 중지 · 잘림 · 서버가 알린 실패 · 받지 못함. 받는 중이거나 온전히 끝났으면 그리지 않는다
function AnswerStatus({ message }: AnswerStatusProps) {
  switch (message.state) {
    case "pending":
      return null;
    case "stopped":
      return <p className="text-xs text-zinc-500">중지됨</p>;
    case "done":
      return message.cut === null ? null : (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {CUT_TEXT[message.cut]}
        </p>
      );
    case "error":
      return <ErrorMessage text={errorEventText(message.code, message.message)} />;
    case "failed":
      return <ErrorMessage text={REQUEST_ERROR_TEXT[message.failure]} />;
  }
}

/**
 * 답변 하나: 기다리는 중(서버의 단계 안내) → 흘려 받는 답 · 출처 → 끝난 모양(잘림 · 오류 안내).
 * 기다리는 표시는 잠깐 기다린 뒤에 보이고(그동안 자리는 잡아 둔다), 한번 보이면 답이 와도 잠시 남는다 (usePendingIndicator).
 * 끊겨도 받은 답은 그대로 두고 아래에 안내를 붙인다. 출처는 답 글이 있을 때만 보여 준다 (error 는 답 없이 끝난다)
 */
export function AssistantMessage({ message }: AssistantMessageProps) {
  const { answer } = message;
  const isWaiting = message.state === "pending" && answer.text === "";
  const isPendingVisible = usePendingIndicator(isWaiting);
  if (isPendingVisible) {
    return <PendingMessage text={answer.stage?.message ?? WAITING_TEXT} />;
  }
  if (isWaiting) {
    // 기다리는 표시를 보이기 전이라 빈 자리만 잡아 둔다. 질문을 보내며 맨 아래로 내린 뒤에
    // 표시가 생겨 입력창 쪽으로 밀려 가려지지 않게 한다
    return <div aria-hidden="true" className={PENDING_HEIGHT_CLASS} />;
  }
  const hasText = answer.text !== "";
  const notes = notesOf(message);
  return (
    <div className="space-y-3">
      {hasText ? (
        <AnswerText
          text={answer.text}
          sources={answer.sources}
          isStreaming={message.state === "pending"}
        />
      ) : null}
      <AnswerStatus message={message} />
      {notes.length > 0 ? <p className="text-xs text-zinc-500">{notes.join(" · ")}</p> : null}
      {hasText && answer.sources.length > 0 ? (
        <Sources
          sources={answer.sources}
          cited={message.state === "done" ? message.cited : undefined}
        />
      ) : null}
    </div>
  );
}
