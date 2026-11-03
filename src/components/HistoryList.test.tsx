// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "./HistoryList";
import type { Conversation } from "../lib/chat";
import { DAY_MS } from "../lib/config";

const NOW = new Date(2026, 9, 13, 15, 0).getTime(); // 2026-10-13 15:00

function conversation(id: string, title: string, updatedAt: number): Conversation {
  return { id, title, createdAt: updatedAt, updatedAt, messages: [] };
}

const LIST = [
  conversation("old", "오래된 문의", NOW - 30 * DAY_MS),
  conversation("today", "오늘 문의", NOW - 60 * 60 * 1000),
  conversation("yesterday", "어제 문의", NOW - DAY_MS),
  conversation("week", "지난주 문의", NOW - 3 * DAY_MS),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(props: Partial<Parameters<typeof HistoryList>[0]> = {}) {
  const onSelect = vi.fn();
  const onRemove = vi.fn();
  render(
    <HistoryList
      conversations={LIST}
      currentId={undefined}
      activeId={undefined}
      onSelect={onSelect}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onSelect, onRemove };
}

describe("HistoryList", () => {
  it("최신순으로 오늘 · 어제 · 지난 7일 · 이전으로 묶는다", () => {
    setup();
    const groups = screen.getAllByRole("region");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "오늘",
      "어제",
      "지난 7일",
      "이전",
    ]);
    expect(within(groups[0]).getByText("오늘 문의")).toBeTruthy();
    expect(within(groups[0]).getByText("14:00")).toBeTruthy();
    expect(within(groups[3]).getByText("9.13")).toBeTruthy();
  });

  it("비어 있으면 안내 문구", () => {
    setup({ conversations: [] });
    expect(screen.getByText("아직 문의가 없습니다.")).toBeTruthy();
  });

  it("보고 있는 대화를 표시하고, 누르면 연다", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup({ currentId: "yesterday" });
    const current = screen.getByRole("button", { name: /^어제 문의/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: /^지난주 문의/ }));
    expect(onSelect).toHaveBeenCalledWith("week");
  });

  it("삭제 버튼으로 지운다. 받는 중인 대화는 삭제 버튼이 없고 표시가 붙는다", async () => {
    const user = userEvent.setup();
    const { onRemove } = setup({ activeId: "today" });
    expect(screen.queryByRole("button", { name: "문의 삭제: 오늘 문의" })).toBeNull();
    expect(screen.getByRole("button", { name: /^답변 받는 중.*오늘 문의/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "문의 삭제: 어제 문의" }));
    expect(onRemove).toHaveBeenCalledWith("yesterday");
  });

  it("제목이 비어 있으면 삭제 버튼도 제목 없음으로 읽힌다", () => {
    setup({ conversations: [conversation("empty", "", NOW)] });
    expect(screen.getByRole("button", { name: "문의 삭제: 제목 없음" })).toBeTruthy();
  });
});
