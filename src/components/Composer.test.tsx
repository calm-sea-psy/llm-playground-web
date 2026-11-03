// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";

afterEach(cleanup);

function setup({ busy = false, initial = "", sendResult = true } = {}) {
  const onSend = vi.fn((_text: string) => sendResult);
  const onStop = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <Composer value={value} onChange={setValue} onSend={onSend} onStop={onStop} isBusy={busy} />
    );
  }
  render(<Harness />);
  const textarea = screen.getByLabelText<HTMLTextAreaElement>("문의 입력");
  return { onSend, onStop, textarea };
}

/** 입력창을 비우고 글을 넣는다. 긴 글도 빠르게 넣도록 붙여 넣기로 */
async function fill(user: UserEvent, textarea: HTMLTextAreaElement, value: string) {
  await user.clear(textarea);
  await user.click(textarea);
  await user.paste(value);
}

describe("Composer", () => {
  it("Enter는 보내고 입력창을 비운다", async () => {
    const user = userEvent.setup();
    const { onSend, textarea } = setup();
    await fill(user, textarea, "배송이 늦어요");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("배송이 늦어요");
    expect(textarea.value).toBe("");
  });

  it("Shift+Enter는 보내지 않는다 (줄바꿈)", async () => {
    const user = userEvent.setup();
    const { onSend, textarea } = setup();
    await fill(user, textarea, "첫 줄");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe("첫 줄\n");
  });

  // IME 합성 이벤트는 user-event 가 만들지 못해 fireEvent 로 흉내 낸다
  it("한글 합성 중 Enter(isComposing)는 무시한다", () => {
    const { onSend, textarea } = setup({ initial: "배송" });
    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keyCode 229 Enter는 무시한다", () => {
    const { onSend, textarea } = setup({ initial: "배송" });
    fireEvent.keyDown(textarea, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("compositionend 직후 같은 틱의 Enter는 무시하고, 그 뒤 Enter는 보낸다 (Safari)", () => {
    vi.useFakeTimers();
    try {
      const { onSend, textarea } = setup({ initial: "배송" });
      fireEvent.compositionEnd(textarea);
      fireEvent.keyDown(textarea, { key: "Enter" });
      expect(onSend).not.toHaveBeenCalled();

      act(() => {
        vi.runAllTimers();
      });
      fireEvent.keyDown(textarea, { key: "Enter" });
      expect(onSend).toHaveBeenCalledWith("배송");
    } finally {
      vi.useRealTimers();
    }
  });

  it("빈 문장 · 공백만이면 보내지 않고 전송 버튼이 꺼진다", async () => {
    const user = userEvent.setup();
    const { onSend, textarea } = setup();
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "문의 전송" });
    expect(button.disabled).toBe(true);
    await fill(user, textarea, "   \n  ");
    expect(button.disabled).toBe(true);
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("2000자 초과면 보내지 않고 경고한다 (코드 포인트 기준, 앞뒤 공백 제외)", async () => {
    const user = userEvent.setup();
    const { onSend, textarea } = setup();
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "문의 전송" });

    await fill(user, textarea, `  ${"가".repeat(2000)}  `);
    expect(button.disabled).toBe(false);
    expect(screen.getByText(/2,000 \/ 2,000/)).toBeTruthy();

    // 이모지는 UTF-16으로 2칸이지만 서버(Python len)에서는 1글자
    await fill(user, textarea, "😀".repeat(2000));
    expect(button.disabled).toBe(false);

    await fill(user, textarea, "가".repeat(2001));
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("너무 깁니다");
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("보내지 못했으면(onSend false) 입력을 지우지 않는다", async () => {
    const user = userEvent.setup();
    const { textarea } = setup({ sendResult: false });
    await fill(user, textarea, "배송이 늦어요");
    await user.keyboard("{Enter}");
    expect(textarea.value).toBe("배송이 늦어요");
  });

  it("답변 중에는 중지 버튼이 보이고, Enter로 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { onSend, onStop, textarea } = setup({ busy: true, initial: "다음 문의" });
    expect(screen.queryByRole("button", { name: "문의 전송" })).toBeNull();
    await user.click(textarea);
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "답변 중지" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
