import { useEffect, useRef } from "react";

import { useAutoScroll } from "../hooks/useAutoScroll";
import type { Message } from "../lib/chat";
import { AssistantMessage } from "./messages/AssistantMessage";
import { UserMessage } from "./messages/UserMessage";

/** 화면 제목. index.html 의 title 과 맞춘다 */
const TITLE = "RAG Q&A";

// 목업에서 응답 상태를 하나씩 보여 주는 예시: answered · answered · needs_clarification("이번 건") · abstained("자료에 없는")
const EXAMPLES = [
  "문서에 나온 신청 절차를 단계별로 알려 주세요.",
  "두 규정이 서로 다르게 적혀 있으면 어느 쪽을 따르나요?",
  "이번 건 마감이 몇 시죠?",
  "자료에 없는 내용도 답해 줄 수 있나요?",
];

interface EmptyStateProps {
  onPickExample: (text: string) => void;
}

interface ChatViewProps {
  messages: Message[];
  /** 답변을 받는 중 (다시 시도를 막는다) */
  isBusy: boolean;
  onRetry: (id: string) => void;
  /** 확인 질문에서 "조건 보완해서 묻기"를 눌렀을 때 */
  onClarify?: () => void;
  onAnnounce?: (text: string) => void;
  /** 빈 대화의 예시 질문을 눌렀을 때 */
  onPickExample: (text: string) => void;
}

/**
 * 메시지 목록. 한 대화가 수백 개가 되기는 어려워 가상 스크롤은 넣지 않는다
 * (필요해지면 이 컴포넌트만 @tanstack/react-virtual 로 바꾼다).
 * 스크롤 컨테이너는 빈 대화일 때도 그대로 둔다 (useAutoScroll 이 같은 요소를 계속 감시하도록).
 */
export function ChatView({
  messages,
  isBusy,
  onRetry,
  onClarify,
  onAnnounce,
  onPickExample,
}: ChatViewProps) {
  const { containerRef, contentRef, isPinned, scrollToBottom } = useAutoScroll();
  const isEmpty = messages.length === 0;

  // 새 메시지(보낸 질문)가 추가되면 다시 바닥에 붙인다
  const countRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > countRef.current) {
      scrollToBottom(true);
    }
    countRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto"
        // 키보드로도 스크롤할 수 있게 Tab 으로 들어온다
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 스크롤 영역은 포커스를 받아야 한다
        tabIndex={0}
        role="region"
        aria-label="대화"
      >
        <div ref={contentRef} className={isEmpty ? "flex min-h-full" : undefined}>
          {isEmpty ? (
            <EmptyState onPickExample={onPickExample} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
              {/* 빈 화면의 제목과 같은 자리. 메시지 안 소제목의 윗단계 */}
              <h1 className="sr-only">{TITLE}</h1>
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} message={m} />
                ) : (
                  <AssistantMessage
                    // 다시 받기는 같은 id 에 createdAt 만 새로 찍는다 → 알림 상태를 처음부터
                    key={`${m.id}:${m.createdAt}`}
                    message={m}
                    onRetry={onRetry}
                    onClarify={onClarify}
                    onAnnounce={onAnnounce}
                    isBusy={isBusy}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {!isPinned && !isEmpty ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-md hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          ↓ {isBusy ? "답변 작성 중 · 맨 아래로" : "맨 아래로"}
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ onPickExample }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{TITLE}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          질문하면 검색한 자료를 근거로 결론 · 근거 · 출처를 답합니다. 검색 방식을 바꿔 결과를
          비교할 수 있습니다.
        </p>
      </div>
      <ul className="flex w-full max-w-md flex-col gap-2">
        {EXAMPLES.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => onPickExample(text)}
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
