// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("렌더 중 예외");
  }
  return <p>정상 화면</p>;
}

beforeEach(() => {
  // React 가 잡은 예외를 console.error 로 남긴다. 테스트 출력을 깨끗하게 둔다
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("예외가 없으면 자식을 그대로 보여 준다", () => {
    render(
      <ErrorBoundary message="안내">
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 화면")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("자식이 렌더 중 예외를 던지면 안내와 새로고침 버튼을 보여 주고, 경계 밖은 그대로다", () => {
    render(
      <div>
        <p>사이드바</p>
        <ErrorBoundary message="대화를 표시하지 못했습니다">
          <Bomb shouldThrow />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByRole("alert").textContent).toContain("대화를 표시하지 못했습니다");
    expect(screen.getByRole("button", { name: "새로고침" })).toBeTruthy();
    expect(screen.getByText("사이드바")).toBeTruthy();
  });

  it("key 를 바꾸면 새로 그린다 (다른 대화로 옮겼을 때)", () => {
    const { rerender } = render(
      <ErrorBoundary key="a" message="안내">
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <ErrorBoundary key="b" message="안내">
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상 화면")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
