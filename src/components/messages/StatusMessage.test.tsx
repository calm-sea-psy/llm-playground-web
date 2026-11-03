// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusMessage } from "./StatusMessage";

const SINCE = new Date(2026, 9, 13, 15, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(SINCE);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StatusMessage", () => {
  it("단계가 없으면 보내는 중이라고 알린다", () => {
    render(<StatusMessage since={SINCE} />);
    expect(screen.getByRole("status").textContent).toBe("문의를 보내는 중...");
  });

  it("서버가 알려 준 단계 문구를 보여 준다", () => {
    render(<StatusMessage stage="answering" since={SINCE} />);
    expect(screen.getByRole("status").textContent).toBe("답변을 작성하는 중...");
  });

  it("adventure 는 경과 시간을 보여 주되 스크린 리더가 매초 읽지 않게 숨긴다", () => {
    render(<StatusMessage stage="adventure" since={SINCE} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const elapsed = screen.getByText("3초");
    expect(elapsed.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("모험을 떠나는 중");
  });
});
