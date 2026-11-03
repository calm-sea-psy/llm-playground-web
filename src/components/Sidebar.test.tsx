// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";
import type { Conversation } from "../lib/chat";

afterEach(cleanup);

const CONVERSATION: Conversation = {
  id: "a",
  title: "배송 문의",
  createdAt: 1,
  updatedAt: 1,
  messages: [],
};

function setup(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const handlers = {
    onNewChat: vi.fn(),
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onUndoRemove: vi.fn(),
  };
  render(
    <Sidebar
      health={{ kind: "checking" }}
      conversations={[CONVERSATION]}
      currentId={undefined}
      activeId={undefined}
      lastDeleted={undefined}
      isStorageOk
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("Sidebar", () => {
  it("새 문의를 누르면 알리고, 보고 있는 대화가 없으면 새 문의가 현재 위치다", async () => {
    const user = userEvent.setup();
    const { onNewChat } = setup();
    const button = screen.getByRole("button", { name: "+ 새 문의" });
    expect(button.getAttribute("aria-current")).toBe("page");
    await user.click(button);
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("보고 있는 대화가 있으면 새 문의는 현재 위치가 아니다", () => {
    setup({ currentId: "a" });
    expect(screen.getByRole("button", { name: "+ 새 문의" }).hasAttribute("aria-current")).toBe(
      false,
    );
  });

  it("방금 지운 대화가 있으면 실행 취소를 보여 준다", async () => {
    const user = userEvent.setup();
    const { onUndoRemove } = setup({ conversations: [], lastDeleted: CONVERSATION });
    expect(screen.getByText("삭제됨: 배송 문의")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(onUndoRemove).toHaveBeenCalledOnce();
  });

  it("저장에 실패하면 경고를 보여 준다", () => {
    setup({ isStorageOk: false });
    expect(screen.getByText(/내역을 저장하지 못했습니다/)).toBeTruthy();
  });
});
