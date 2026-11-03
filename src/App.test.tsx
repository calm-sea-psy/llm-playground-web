// @vitest-environment jsdom
// 앱 전체: 테마 전환 · 좁은 화면 덮개(drawer). /health는 실패하게 두고(연결 안 됨) 화면 동작만 본다.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { THEME_KEY } from "./hooks/useTheme";
import { CURRENT_KEY, HISTORY_KEY } from "./lib/history";
import { fakeApiClient } from "./test/fakeApi";
import { providersWith } from "./test/providersWith";

/** matchMedia 흉내: 넓은 화면 여부 · OS 다크 설정을 바꿀 수 있다 */
function stubMatchMedia({ desktop, systemDark }: { desktop: boolean; systemDark: boolean }) {
  const listeners = new Map<string, Set<() => void>>();
  const state = { desktop, systemDark };
  const matches = (query: string): boolean => {
    if (query.includes("min-width")) {
      return state.desktop;
    }
    return query.includes("dark") && state.systemDark;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) {
        listeners.set(query, new Set());
      }
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_: string, cb: () => void) => listeners.get(query)?.delete(cb),
  }));
  return {
    setSystemDark(value: boolean) {
      state.systemDark = value;
      act(() => {
        listeners.forEach((set, q) => q.includes("dark") && set.forEach((cb) => cb()));
      });
    },
  };
}

/** 서버는 꺼진 상태(연결 안 됨)로 두고 화면 동작만 본다 */
function renderApp() {
  return render(<App />, { wrapper: providersWith(fakeApiClient()) });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  // jsdom에는 ResizeObserver가 없다 (자동 스크롤용)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("테마: 시스템이면 OS 설정을 따라가고, 고르면 저장한다", async () => {
    const user = userEvent.setup();
    const media = stubMatchMedia({ desktop: true, systemDark: false });
    renderApp();
    const root = document.documentElement;
    const select = screen.getByLabelText<HTMLSelectElement>("화면 테마");
    expect(select.value).toBe("system");
    expect(root.classList.contains("dark")).toBe(false);

    media.setSystemDark(true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");

    await user.selectOptions(select, "light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe("light");

    await user.selectOptions(select, "system");
    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("테마: 저장된 테마로 시작한다", () => {
    localStorage.setItem(THEME_KEY, "dark");
    stubMatchMedia({ desktop: true, systemDark: false });
    renderApp();
    expect(screen.getByLabelText<HTMLSelectElement>("화면 테마").value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("저장된 답변 메타가 어긋나도 화면이 깨지지 않고 답변은 보인다", () => {
    stubMatchMedia({ desktop: true, systemDark: false });
    const message = { status: "done", createdAt: 1, content: "저장된 답변" };
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        version: 2,
        conversations: [
          {
            id: "a",
            title: "문의",
            createdAt: 1,
            updatedAt: 1,
            messages: [
              { ...message, id: "u", role: "user" },
              // 예전 검사를 통과하던 모양: model · toolsUsed · usage 를 읽다가 예외가 났다
              { ...message, id: "m", role: "assistant", meta: { requestId: "req", model: 1 } },
            ],
          },
        ],
      }),
    );
    localStorage.setItem(CURRENT_KEY, "a");
    renderApp();
    expect(screen.getAllByText("저장된 답변").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("처리 과정 ▸")).toBeNull();
  });

  it("넓은 화면에는 햄버거 버튼이 없고 사이드바가 바로 보인다", () => {
    stubMatchMedia({ desktop: true, systemDark: false });
    renderApp();
    expect(screen.queryByRole("button", { name: /메뉴 열기/ })).toBeNull();
    expect(document.getElementById("sidebar")!.hasAttribute("inert")).toBe(false);
  });

  it("좁은 화면: 햄버거로 덮개를 열고, Esc로 닫으면 포커스가 햄버거로 돌아온다", async () => {
    const user = userEvent.setup();
    stubMatchMedia({ desktop: false, systemDark: false });
    renderApp();
    const sidebar = document.getElementById("sidebar")!;
    const menu = screen.getByRole("button", { name: /메뉴 열기/ });
    expect(sidebar.hasAttribute("inert")).toBe(true); // 닫힌 덮개 안으로 Tab이 들어가지 않게
    expect(menu.getAttribute("aria-expanded")).toBe("false");

    await user.click(menu);
    expect(sidebar.hasAttribute("inert")).toBe(false);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(sidebar.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(menu);
  });

  it("좁은 화면: 배경을 누르거나 새 문의를 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    stubMatchMedia({ desktop: false, systemDark: false });
    renderApp();
    const sidebar = document.getElementById("sidebar")!;
    await user.click(screen.getByRole("button", { name: /메뉴 열기/ }));
    await user.click(document.querySelector(".bg-black\\/40")!);
    expect(sidebar.hasAttribute("inert")).toBe(true);

    await user.click(screen.getByRole("button", { name: /메뉴 열기/ }));
    await user.click(screen.getByRole("button", { name: "+ 새 문의" }));
    expect(sidebar.hasAttribute("inert")).toBe(true);
  });
});
