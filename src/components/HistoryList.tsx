import { memo } from "react";

import { useNow } from "../hooks/useNow";
import type { DeletedConversation } from "../hooks/useUndoDelete";
import { titleOf, type Conversation } from "../lib/chat";
import { groupByDate, timeLabel } from "../lib/dates";
import { sortByRecent } from "../lib/history";

/** 실행 취소 카운트다운을 다시 그리는 간격. 1초보다 짧게 두어 숫자가 늦게 바뀌지 않게 한다 */
const COUNTDOWN_TICK_MS = 200;

interface HistoryListProps {
  conversations: Conversation[];
  currentId: string | undefined;
  /** 답변을 받는 중인 대화 (지울 수 없다) */
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  /** 지운 뒤 아직 실행 취소를 받는 대화들. 목록에서 원래 있던 자리마다 남은 초와 실행 취소 안내를 보여 준다 */
  recentlyDeleted: DeletedConversation[];
  /** 지운 대화 하나를 되돌린다 */
  onUndoRemove: (id: string) => void;
}

interface ConversationItemProps {
  conversation: Conversation;
  /** 지금 시각 (ms). 시각 표시 기준 */
  now: number;
  /** 보고 있는 대화인지 */
  isSelected: boolean;
  /** 답변을 받는 중인지 (지울 수 없다) */
  isActive: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

// 대화 한 줄: 누르면 열고, 마우스를 올리거나 포커스하면 삭제 버튼이 보인다 (터치 기기는 늘 보인다)
function ConversationItem({
  conversation,
  now,
  isSelected,
  isActive,
  onSelect,
  onRemove,
}: ConversationItemProps) {
  const title = titleOf(conversation);
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={isSelected ? "page" : undefined}
        className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-left text-sm ${
          isSelected
            ? "bg-zinc-200 font-medium dark:bg-zinc-800"
            : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
        }`}
      >
        {isActive ? (
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse">
            <span className="sr-only">답변 받는 중 </span>
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="shrink-0 text-[11px] font-normal text-zinc-500 tabular-nums">
          {timeLabel(conversation.updatedAt, now)}
        </span>
      </button>
      {!isActive ? (
        <button
          type="button"
          onClick={() => onRemove(conversation.id)}
          aria-label={`대화 삭제: ${title}`}
          className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-800 focus-visible:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 pointer-coarse:opacity-100"
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}

interface DeletedItemProps {
  title: string;
  /** 실행 취소를 그만 받는 시각(ms) */
  deadline: number;
  onUndo: () => void;
}

// 지운 대화가 있던 자리의 실행 취소 안내. 왼쪽에 실행 취소를 받는 남은 초를 보여 준다.
// 남은 초는 0 이 되기 전에 안내가 사라지므로 1 아래로는 보이지 않고, 바뀔 때마다 스크린 리더가 읽지 않게 숨긴다
function DeletedItem({ title, deadline, onUndo }: DeletedItemProps) {
  const now = useNow(COUNTDOWN_TICK_MS);
  const seconds = Math.max(1, Math.ceil((deadline - now) / 1000));
  return (
    <li>
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg bg-zinc-200 py-1.5 pr-2 pl-2 text-sm dark:bg-zinc-800"
      >
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-zinc-400 text-[11px] font-medium text-zinc-600 tabular-nums dark:border-zinc-500 dark:text-zinc-300"
        >
          {seconds}
        </span>
        <span className="min-w-0 flex-1 truncate text-zinc-500">삭제됨: {title}</span>
        {/* 지운 대화가 여럿이면 실행 취소 버튼도 여럿이라 이름에 제목을 붙여 구분한다 */}
        <button
          type="button"
          onClick={onUndo}
          aria-label={`실행 취소: ${title}`}
          className="shrink-0 text-xs font-medium underline underline-offset-2"
        >
          실행 취소
        </button>
      </div>
    </li>
  );
}

// 목록에 지운 대화들을 다시 끼운다. 최근 활동순이라 지우기 전에 있던 자리에 들어간다
function withDeleted(
  conversations: Conversation[],
  deleted: DeletedConversation[],
): Conversation[] {
  const listedIds = new Set(conversations.map((c) => c.id));
  const unlisted = deleted.map((d) => d.conversation).filter((c) => !listedIds.has(c.id));
  return unlisted.length === 0 ? conversations : [...conversations, ...unlisted];
}

function HistoryListView({
  conversations,
  currentId,
  activeId,
  onSelect,
  onRemove,
  recentlyDeleted,
  onUndoRemove,
}: HistoryListProps) {
  const now = useNow();
  const listed = withDeleted(conversations, recentlyDeleted);
  // 지운 대화 → 실행 취소를 그만 받는 시각. 같은 id 로 다시 생긴 대화와 헷갈리지 않게 대화 객체로 찾는다
  const deadlineOf = new Map(recentlyDeleted.map((d) => [d.conversation, d.deadline]));
  if (listed.length === 0) {
    return <p className="px-1 text-xs text-zinc-500">아직 대화가 없습니다.</p>;
  }

  return (
    <div className="space-y-4">
      {groupByDate(sortByRecent(listed), (c) => c.updatedAt, now).map(({ label, items }) => (
        <section key={label} aria-label={label}>
          <h3 className="px-1 pb-1 text-[11px] font-medium text-zinc-500">{label}</h3>
          <ul className="space-y-0.5">
            {items.map((c) => {
              const deadline = deadlineOf.get(c);
              return deadline === undefined ? (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  now={now}
                  isSelected={c.id === currentId}
                  isActive={c.id === activeId}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ) : (
                <DeletedItem
                  key={c.id}
                  title={titleOf(c)}
                  deadline={deadline}
                  onUndo={() => onUndoRemove(c.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * 대화 목록: 최신순, 오늘 · 어제 · 지난 7일 · 이전으로 묶는다. 지운 대화는 실행 취소를 받는 동안 대화마다 그 자리에 남은 초와 실행 취소 안내로 남긴다.
 * 대화가 수백 개일 수 있어 memo 로 감싼다 (입력창에 칠 때마다 다시 그리지 않게). 넘기는 핸들러는 고정해서 넘긴다
 */
export const HistoryList = memo(HistoryListView);
