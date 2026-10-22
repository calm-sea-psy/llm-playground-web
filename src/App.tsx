import { useRef, useState } from "react";

import type { Provider } from "./api/types";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { ProviderSelect } from "./components/ProviderSelect";
import { Sidebar } from "./components/Sidebar";
import { ThemeSelect } from "./components/ThemeSelect";
import { useAnnouncer } from "./hooks/useAnnouncer";
import { useChat } from "./hooks/useChat";
import { useDrawer } from "./hooks/useDrawer";
import { useHealth } from "./hooks/useHealth";
import { useTheme } from "./hooks/useTheme";

/** 서버 상태를 모를 때 쓰는 모델 */
const FALLBACK_PROVIDER: Provider = "local";

const DRAWER_PANEL_CLASS =
  "fixed inset-y-0 left-0 z-40 flex shadow-xl transition-transform duration-200 motion-reduce:transition-none";

/** 상담 도우미 화면: 사이드바(문의 내역 · 서버 상태) + 대화 + 입력창 */
export function App() {
  const { health, recheck } = useHealth();
  // 답변 요청이 network 오류면 서버 상태도 바로 다시 확인한다 (사이드바 "연결 안 됨"과 맞추려고)
  const chat = useChat({ onNetworkError: recheck });
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
  /** 사용자가 고르기 전에는 서버 기본값(defaultProvider)을 따른다 */
  const [chosenProvider, setChosenProvider] = useState<Provider | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const serverDefault = "health" in health ? health.health.defaultProvider : null;
  const provider = chosenProvider ?? serverDefault ?? FALLBACK_PROVIDER;
  // 요청은 한 번에 하나: 보고 있는 대화가 받는 중이면 중지 버튼, 다른 대화가 받는 중이면 전송을 막는다
  const isBusyHere = chat.busy && chat.activeId === chat.currentId;
  const isBusyElsewhere = chat.busy && !isBusyHere;

  function handleNewChat(): void {
    chat.newChat();
    setDraft("");
    if (isDrawer) {
      closeDrawer();
    } else {
      inputRef.current?.focus();
    }
  }

  function handleSelect(id: string): void {
    chat.select(id);
    if (isDrawer) {
      closeDrawer();
    }
  }

  function handlePickExample(text: string): void {
    setDraft(text);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full">
      {isDrawerOpen ? (
        // 키보드로는 Esc 로 닫는다 (useDrawer). 배경은 마우스 · 터치용이라 포커스를 받지 않는다

        <div className="fixed inset-0 z-30 bg-black/40" onClick={closeDrawer} aria-hidden="true" />
      ) : null}
      <div
        ref={panelRef}
        id="sidebar"
        className={
          isDrawer
            ? `${DRAWER_PANEL_CLASS} ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"}`
            : "flex"
        }
        inert={!!isDrawer && !isDrawerOpen}
        role={isDrawer ? "dialog" : undefined}
        aria-modal={isDrawerOpen || undefined}
        aria-label={isDrawer ? "메뉴" : undefined}
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
          isStorageOk={chat.storageOk}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          {isDrawer ? (
            <button
              ref={triggerRef}
              type="button"
              onClick={openDrawer}
              aria-label="메뉴 열기 (문의 내역 · 서버 상태)"
              aria-expanded={isDrawerOpen}
              aria-controls="sidebar"
              className="-ml-1 rounded-lg px-2 py-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ☰
            </button>
          ) : null}
          <ProviderSelect value={provider} onChange={setChosenProvider} disabled={chat.busy} />
          <div className="ml-auto">
            <ThemeSelect value={theme} onChange={setTheme} />
          </div>
        </header>
        <ChatView
          key={chat.currentId ?? "new"}
          messages={chat.messages}
          isBusy={chat.busy}
          onRetry={chat.retry}
          onRegenerate={chat.regenerate}
          onAnnounce={announce}
          onPickExample={handlePickExample}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => chat.send(text, provider)}
          onStop={chat.stop}
          isBusy={isBusyHere}
          isBlocked={isBusyElsewhere}
          inputRef={inputRef}
        />
      </main>

      <div aria-live="polite" className="sr-only" data-testid="announcer">
        {announcement}
      </div>
    </div>
  );
}
