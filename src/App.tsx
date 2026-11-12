import { useCallback, useRef, useState } from "react";

import { RETRIEVAL_MODES, type RetrievalMode } from "./api/types";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RetrievalModeSelect } from "./components/RetrievalModeSelect";
import { Sidebar } from "./components/Sidebar";
import { SidebarDrawer } from "./components/SidebarDrawer";
import { ThemeSelect } from "./components/ThemeSelect";
import { useAnnouncer } from "./hooks/useAnnouncer";
import { useChat } from "./hooks/useChat";
import { useDrawer } from "./hooks/useDrawer";
import { useHealth } from "./hooks/useHealth";
import { useTheme } from "./hooks/useTheme";
import { isAwaitingClarification } from "./lib/chat";
import { DEFAULT_RETRIEVAL_MODE } from "./lib/config";

/** 마지막 답이 확인 질문일 때 입력창 안내 */
const CLARIFY_PLACEHOLDER = "확인 질문에 답하거나 빠진 조건을 넣어 주세요";

/** RAG Q&A 화면: 사이드바(질문 내역 · 서버 상태) + 대화 + 입력창 */
export function App() {
  const { health, recheck } = useHealth();
  // 질문이 서버 쪽 문제로 실패하면 서버 상태도 바로 다시 확인한다 (사이드바 표시와 맞추려고)
  const chat = useChat({ onServerTrouble: recheck });
  const { select: selectConversation } = chat;
  const { theme, setTheme } = useTheme();
  const {
    isDrawer,
    isOpen: isDrawerOpen,
    open: openDrawer,
    close: closeDrawer,
    panelRef,
    triggerRef,
  } = useDrawer();
  const { message: announcement, announce } = useAnnouncer();
  const [draft, setDraft] = useState("");
  const [chosenMode, setChosenMode] = useState<RetrievalMode>(DEFAULT_RETRIEVAL_MODE);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 서버가 지원 방식(supported_modes)을 알려 주면 그 안에서만 고른다. 고른 방식이 빠졌으면 첫 방식으로
  const serverModes = "health" in health ? health.health.supportedModes : [];
  const modes: readonly RetrievalMode[] = serverModes.length > 0 ? serverModes : RETRIEVAL_MODES;
  const retrievalMode = modes.includes(chosenMode)
    ? chosenMode
    : (modes[0] ?? DEFAULT_RETRIEVAL_MODE);
  const isClarifying = isAwaitingClarification(chat.messages);
  // 요청은 한 번에 하나: 보고 있는 대화가 받는 중이면 중지 버튼, 다른 대화가 받는 중이면 전송을 막는다
  const isBusyHere = chat.isBusy && chat.activeId === chat.currentId;
  const isBusyElsewhere = chat.isBusy && !isBusyHere;

  function handleNewChat(): void {
    chat.newChat();
    setDraft("");
    if (isDrawer) {
      closeDrawer();
    } else {
      inputRef.current?.focus();
    }
  }

  // 글자를 칠 때마다(draft) App 이 다시 그려지므로, memo 된 내역 · 답변에 넘기는 함수는 고정한다
  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      if (isDrawer) {
        closeDrawer();
      }
    },
    [selectConversation, isDrawer, closeDrawer],
  );

  function handlePickExample(text: string): void {
    setDraft(text);
    inputRef.current?.focus();
  }

  /** 확인 질문에 답할 수 있게 입력창으로 옮긴다 (같은 세션이라 빠진 조건만 적어도 이어서 답한다) */
  const handleClarify = useCallback(() => inputRef.current?.focus(), []);

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
          lastDeleted={chat.lastDeleted}
          onUndoRemove={chat.undoRemove}
          isStorageOk={chat.isStorageOk}
        />
      </SidebarDrawer>

      {/* 덮개가 열린 동안 Tab 이 덮개 뒤로 빠지지 않게 한다 */}
      <main className="flex min-w-0 flex-1 flex-col" inert={isDrawerOpen}>
        <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          {isDrawer ? (
            <button
              ref={triggerRef}
              type="button"
              onClick={openDrawer}
              aria-label="메뉴 열기 (질문 내역 · 서버 상태)"
              aria-expanded={isDrawerOpen}
              aria-controls="sidebar"
              className="-ml-1 rounded-lg px-2 py-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ☰
            </button>
          ) : null}
          <RetrievalModeSelect
            value={retrievalMode}
            onChange={setChosenMode}
            modes={modes}
            disabled={chat.isBusy}
          />
          <div className="ml-auto">
            <ThemeSelect value={theme} onChange={setTheme} />
          </div>
        </header>
        {/* 대화 영역만 경계로 묶어 사이드바 · 입력창은 살려 둔다. 다른 대화로 옮기면 key 로 새로 그린다 */}
        <ErrorBoundary
          key={chat.currentId ?? "new"}
          message="이 대화를 표시하지 못했습니다. 다른 질문을 고르거나 새로고침해 주세요."
        >
          <ChatView
            messages={chat.messages}
            isBusy={chat.isBusy}
            onRetry={chat.retry}
            onClarify={handleClarify}
            onAnnounce={announce}
            onPickExample={handlePickExample}
          />
        </ErrorBoundary>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => chat.send(text, retrievalMode)}
          onStop={chat.stop}
          isBusy={isBusyHere}
          isBlocked={isBusyElsewhere}
          inputRef={inputRef}
          placeholder={isClarifying ? CLARIFY_PLACEHOLDER : undefined}
        />
      </main>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
