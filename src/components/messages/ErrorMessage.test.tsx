// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorMessage } from "./ErrorMessage";

afterEach(cleanup);

describe("ErrorMessage", () => {
  it.each([
    ["llm_error", "모델 서버(Ollama)가 꺼져 있을 수 있습니다."],
    ["config_error", "서버 설정을 확인하세요"],
    ["llm_timeout", "응답 시간이 초과되었습니다."],
    ["network", "API 서버에 연결할 수 없습니다."],
    ["incomplete", "답변을 끝까지 받지 못했습니다"],
    ["처음 보는 코드", "알 수 없는 오류가 발생했습니다."],
  ])("%s 안내 + 다시 시도", (code, guide) => {
    render(
      <ErrorMessage error={{ code, message: "ConnectError: [Errno 111]" }} onRetry={() => {}} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(guide);
    expect(screen.getByRole("alert").textContent).toContain("ConnectError: [Errno 111]");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("다시 시도를 누르면 알린다", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorMessage error={{ code: "network", message: "끊김" }} onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("입력 오류는 다시 보내도 같아서 다시 시도 버튼이 없다", () => {
    render(
      <ErrorMessage
        error={{ code: "invalid_input", message: "text: 빈 문장" }}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });
});
