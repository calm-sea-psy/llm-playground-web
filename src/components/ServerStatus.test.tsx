// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ServerStatus } from "./ServerStatus";
import type { Health } from "../api/types";

afterEach(cleanup);

const HEALTH: Health = {
  classifier: "klue-roberta",
  classifierDevice: "cuda",
  classifierError: null,
  routeRuleEnabled: true,
  verifyMode: "uncertain",
  defaultProvider: "local",
};

describe("ServerStatus", () => {
  it("정상이면 분류기와 검증 모드를 보여 준다", () => {
    render(<ServerStatus state={{ kind: "ok", health: HEALTH }} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("서버 정상");
    expect(status.textContent).toContain("klue-roberta · cuda");
    expect(status.textContent).toContain("불확실할 때 검증");
  });

  it("확인 중에는 그 상태만 보여 준다", () => {
    render(<ServerStatus state={{ kind: "checking" }} />);
    expect(screen.getByRole("status").textContent).toBe("확인 중...");
  });

  it("분류기 오류의 원인을 글로 보여 준다 (키보드 · 스크린 리더로도 볼 수 있게)", () => {
    const health = { ...HEALTH, classifierError: "모델 파일 없음" };
    render(<ServerStatus state={{ kind: "classifier_error", health }} />);
    expect(screen.getByRole("status").textContent).toContain("분류기 오류");
    expect(screen.getByText("모델 파일 없음")).toBeTruthy();
  });

  it("연결이 안 되면 이유를 글로 보여 준다", () => {
    render(<ServerStatus state={{ kind: "offline", reason: "Failed to fetch" }} />);
    expect(screen.getByRole("status").textContent).toContain("연결 안 됨");
    expect(screen.getByText("API 서버에 연결할 수 없습니다 (Failed to fetch)")).toBeTruthy();
  });
});
