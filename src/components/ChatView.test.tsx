// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatView } from "./ChatView";
import type { Message } from "../lib/chat";
import { TypewriterMemoryProvider } from "../providers/TypewriterMemoryProvider";

const USER: Message = {
  id: "u1",
  role: "user",
  content: "배송이 늦어요",
  status: "done",
  createdAt: 1,
};

function assistant(overrides: Partial<Message>): Message {
  return { id: "a1", role: "assistant", content: "", status: "done", createdAt: 1, ...overrides };
}

const HANDLERS = { onRetry: () => {}, onRegenerate: () => {}, onPickExample: () => {} };

function renderChat(messages: Message[], props: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return (
    <TypewriterMemoryProvider>
      <ChatView messages={messages} isBusy={false} {...HANDLERS} {...props} />
    </TypewriterMemoryProvider>
  );
}

beforeEach(() => {
  // jsdom 에는 ResizeObserver · scrollTo 가 없다 (자동 스크롤용)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ChatView", () => {
  it("빈 대화에는 예시 문의를 보여 주고, 누르면 알린다", async () => {
    const user = userEvent.setup();
    const onPickExample = vi.fn();
    render(renderChat([], { onPickExample }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Seal 상담 도우미");
    await user.click(screen.getByRole("button", { name: "서울 날씨 어때요?" }));
    expect(onPickExample).toHaveBeenCalledWith("서울 날씨 어때요?");
  });

  it("메시지를 역할에 맞게 그린다", () => {
    render(renderChat([USER, assistant({ content: "답변 내용" })]));
    expect(screen.getByText("배송이 늦어요")).toBeTruthy();
    expect(screen.getByText("답변 내용")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "서울 날씨 어때요?" })).toBeNull();
  });

  it("저장본의 답변을 다시 받으면 처음부터 흘려 보여 주고, 끝나면 알린다", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout"],
    });
    const onAnnounce = vi.fn();
    const stopped = assistant({ content: "이전에 받은 글", status: "stopped", createdAt: 1 });
    const { rerender } = render(renderChat([USER, stopped], { onAnnounce }));
    expect(onAnnounce).not.toHaveBeenCalled(); // 처음부터 끝난 상태로 올라온 내역

    // 다시 받기: 같은 id 에 createdAt 만 새로 찍힌다
    const pending = assistant({ status: "pending", createdAt: 2 });
    rerender(renderChat([USER, pending], { onAnnounce }));

    const longer = "이전에 받은 글보다 더 긴 새 답변";
    const streaming = assistant({ content: longer, status: "streaming", createdAt: 2 });
    rerender(renderChat([USER, streaming], { onAnnounce }));
    expect(screen.queryByText(longer)).toBeNull(); // 예전 길이까지 한 번에 보이지 않는다

    const done = assistant({ content: longer, status: "done", createdAt: 2 });
    rerender(renderChat([USER, done], { onAnnounce }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(longer)).toBeTruthy();
    expect(onAnnounce).toHaveBeenCalledOnce();
    expect(onAnnounce).toHaveBeenCalledWith(`답변 완료: ${longer}`);
  });

  it("다시 받아 또 중지하면 다시 알린다", () => {
    const onAnnounce = vi.fn();
    const first = assistant({ status: "pending", createdAt: 1 });
    const { rerender } = render(renderChat([USER, first], { onAnnounce }));
    rerender(renderChat([USER, { ...first, status: "stopped" }], { onAnnounce }));
    expect(onAnnounce).toHaveBeenCalledOnce();

    const second = assistant({ status: "pending", createdAt: 2 });
    rerender(renderChat([USER, second], { onAnnounce }));
    rerender(renderChat([USER, { ...second, status: "stopped" }], { onAnnounce }));
    expect(onAnnounce).toHaveBeenCalledTimes(2);
  });
});
