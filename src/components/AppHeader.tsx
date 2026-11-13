import type { RefObject } from "react";

import { ThemeSelect } from "./ThemeSelect";
import type { Theme } from "../lib/labels";

/** 화면 제목 (index.html 의 title 과 같다) */
const APP_TITLE = "위키백과 Q&A";

interface AppHeaderProps {
  /** 좁은 화면이라 사이드바가 서랍으로 동작하는지. 그때만 메뉴 버튼을 보인다 */
  isDrawer: boolean;
  isDrawerOpen: boolean;
  onOpenDrawer: () => void;
  /** 메뉴 버튼. 서랍을 닫으면 포커스를 여기로 돌려준다 */
  drawerTriggerRef: RefObject<HTMLButtonElement | null>;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

/** 머리줄: 메뉴 버튼(좁은 화면) · 제목 · 테마 */
export function AppHeader({
  isDrawer,
  isDrawerOpen,
  onOpenDrawer,
  drawerTriggerRef,
  theme,
  onThemeChange,
}: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {isDrawer ? (
        <button
          ref={drawerTriggerRef}
          type="button"
          onClick={onOpenDrawer}
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
        <ThemeSelect value={theme} onChange={onThemeChange} />
      </div>
    </header>
  );
}
