import { useCallback, useRef, useState } from "react";

import type { AskMode } from "./api/types";
import { AskModeSelect } from "./components/AskModeSelect";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Sidebar } from "./components/Sidebar";
import { SidebarDrawer } from "./components/SidebarDrawer";
import { ThemeSelect } from "./components/ThemeSelect";
import { useChat } from "./hooks/useChat";
import { useDraft } from "./hooks/useDraft";
import { useDrawer } from "./hooks/useDrawer";
import { useHealth } from "./hooks/useHealth";
import { useTheme } from "./hooks/useTheme";
import { DEFAULT_ASK_MODE } from "./lib/config";

/** 화면 제목 (index.html 의 title 과 같다) */
const APP_TITLE = "위키백과 Q&A";

/** 다른 대화가 답변을 받는 동안 입력창 아래 안내 (요청은 한 번에 하나) */
const BUSY_ELSEWHERE_HINT = "다른 대화의 답변을 받는 중입니다. 끝나면 보낼 수 있습니다";

/** 새 대화 화면의 입력 초안 키 (대화 id 는 UUID 라 겹치지 않는다) */
const NEW_CHAT_DRAFT_KEY = "new";

/** 위키 Q&A 화면: 사이드바(새 대화 · 대화 목록 · 서버 상태) + 머리줄(답변 방식 · 테마) + 대화 + 입력창 */
export function App() {
  const { health, recheck } = useHealth();
  const chat = useChat({ onServerTrouble: recheck });
  const { theme, setTheme } = useTheme();
  const {
    isDrawer,
    isOpen: isDrawerOpen,
    open: openDrawer,
    close: closeDrawer,
    panelRef,
    triggerRef,
  } = useDrawer();
  const { draft, setDraft, replaceDraft, canUndoReplace, undoReplace } = useDraft(
    chat.currentId ?? NEW_CHAT_DRAFT_KEY,
  );
  const [mode, setMode] = useState<AskMode>(DEFAULT_ASK_MODE);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 요청은 한 번에 하나: 보고 있는 대화가 받는 중이면 중지 버튼, 다른 대화가 받는 중이면 보내지 않는다
  const isBusyHere = chat.isBusy && chat.activeId === chat.currentId;
  const isBusyElsewhere = chat.isBusy && !isBusyHere;

  // memo 된 대화 화면에 넘기므로 렌더마다 새로 만들지 않는다. 예시 질문으로 입력창을 바꾼다
  // (쓰던 글이 있었으면 입력창 아래 실행 취소로 살린다)
  const handlePickExample = useCallback(
    (text: string) => {
      replaceDraft(text);
      inputRef.current?.focus();
    },
    [replaceDraft],
  );

  function handleUndoReplace(): void {
    undoReplace();
    inputRef.current?.focus();
  }

  function handleNewChat(): void {
    chat.newChat();
    if (isDrawer) {
      closeDrawer();
    } else {
      inputRef.current?.focus();
    }
  }

  // memo 된 대화 목록에 넘기므로 렌더마다 새로 만들지 않는다 (입력할 때마다 목록을 다시 그리지 않게)
  const { select } = chat;
  const handleSelect = useCallback(
    (id: string) => {
      select(id);
      if (isDrawer) {
        closeDrawer();
      }
    },
    [select, isDrawer, closeDrawer],
  );

  return (
    <div className="flex h-full">
      <SidebarDrawer
        isDrawer={isDrawer}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        panelRef={panelRef}
      >
        <Sidebar
          health={health}
          conversations={chat.conversations}
          currentId={chat.currentId}
          activeId={chat.activeId}
          onNewChat={handleNewChat}
          onSelect={handleSelect}
          onRemove={chat.remove}
          recentlyDeleted={chat.recentlyDeleted}
          onUndoRemove={chat.undoRemove}
          saveResult={chat.saveResult}
        />
      </SidebarDrawer>

      {/* 서랍이 열린 동안 Tab 이 서랍 뒤로 빠지지 않게 한다 */}
      <main className="flex min-w-0 flex-1 flex-col" inert={isDrawerOpen}>
        <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {isDrawer ? (
            <button
              ref={triggerRef}
              type="button"
              onClick={openDrawer}
              aria-label="메뉴 열기 (대화 목록 · 서버 상태)"
              aria-expanded={isDrawerOpen}
              aria-controls="sidebar"
              className="-ml-1 rounded-lg px-2 py-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ☰
            </button>
          ) : null}
          {/* 좁은 화면에서는 머리줄 자리가 모자라 화면에서만 숨긴다 (스크린 리더는 읽는다) */}
          <h1 className="truncate text-sm font-semibold max-md:sr-only">{APP_TITLE}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AskModeSelect value={mode} onChange={setMode} disabled={chat.isBusy} />
            <ThemeSelect value={theme} onChange={setTheme} />
          </div>
        </header>
        {/* 대화 영역만 경계로 묶어 사이드바 · 입력창은 살려 둔다. 다른 대화로 옮기면 key 로 새로 그린다 */}
        <ErrorBoundary
          key={chat.currentId ?? "new"}
          message="이 대화를 표시하지 못했습니다. 다른 대화를 고르거나 새로고침해 주세요."
        >
          <ChatView messages={chat.messages} onPickExample={handlePickExample} />
        </ErrorBoundary>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => chat.send(text, mode)}
          onStop={chat.stop}
          isBusy={isBusyHere}
          isDisabled={isBusyElsewhere}
          inputRef={inputRef}
          hint={isBusyElsewhere ? BUSY_ELSEWHERE_HINT : undefined}
          onUndoReplace={canUndoReplace ? handleUndoReplace : undefined}
        />
      </main>
    </div>
  );
}
