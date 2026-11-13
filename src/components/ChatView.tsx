import { memo, useEffect, useRef } from "react";

import { AssistantMessage } from "./messages/AssistantMessage";
import { UserMessage } from "./messages/UserMessage";
import type { Message } from "../lib/chat";

/** 빈 대화의 예시 질문. 서버 없는 목업은 꼬리표 없는 질문에 같은 grounded 예시로 답한다 */
const EXAMPLES = [
  "경복궁을 중건한 사람은?",
  "광합성은 어떤 과정인가요?",
  "훈민정음은 언제 반포되었나요?",
];

interface ChatViewProps {
  messages: Message[];
  /** 빈 대화의 예시 질문을 눌렀을 때 */
  onPickExample: (text: string) => void;
}

interface EmptyStateProps {
  onPickExample: (text: string) => void;
}

function EmptyState({ onPickExample }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 text-center">
      {/* justify-center 로 가운데에 두면 화면이 낮을 때 넘친 위쪽을 스크롤로 볼 수 없어 my-auto 를 쓴다 */}
      <div className="my-auto flex flex-col items-center gap-6">
        <div>
          <h2 className="text-xl font-semibold">무엇이 궁금하신가요?</h2>
          <p className="mt-2 text-sm text-zinc-500">
            한국어 위키백과 문서를 찾아 출처 번호와 함께 답합니다. 질문마다 따로 답하고 앞 대화는
            기억하지 않습니다.
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
    </div>
  );
}

function ChatViewInner({ messages, onPickExample }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);
  // 답이 보이기 시작했는지: 첫 조각이 왔거나 받지 못한 채 끝났다
  const hasAnswerStarted =
    last?.role === "assistant" && (last.answer.text !== "" || last.state !== "pending");

  // 질문을 보내면 맨 아래로 내리고, 답이 보이기 시작하면 그 답의 처음에 맞춘다.
  // 답이 흘러 들어오는 동안에는 따라 내리지 않는다 (읽던 자리를 빼앗지 않고, 긴 답의 첫머리가 위로 밀려나지 않게)
  useEffect(() => {
    if (hasAnswerStarted) {
      lastRef.current?.scrollIntoView({ block: "start" });
    } else {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, hasAnswerStarted]);

  if (messages.length === 0) {
    return <EmptyState onPickExample={onPickExample} />;
  }
  // relative 가 없으면 안쪽 절대 위치 요소(sr-only 라벨)가 이 영역에 잘리지 않고 문서 높이를 늘려 페이지 전체가 스크롤된다.
  // role=log 는 새로 붙는 메시지만 스크린 리더에 알린다 (답변 · 오류. 지난 대화를 열 때는 다시 읽지 않는다)
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto" role="log" aria-label="대화">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((m) => (
          <div key={m.id} ref={m === last ? lastRef : undefined} className="scroll-mt-6">
            {m.role === "user" ? <UserMessage message={m} /> : <AssistantMessage message={m} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/**
 * 질문 · 답변 목록. 질문을 보내면 맨 아래로, 답이 보이기 시작하면 그 답의 처음이 보이게 내린다.
 * 대화가 길 수 있어 memo 로 감싼다 (입력창에 칠 때마다 다시 그리지 않게). 넘기는 핸들러는 고정해서 넘긴다
 */
export const ChatView = memo(ChatViewInner);
