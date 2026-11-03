import { afterEach, describe, expect, it, vi } from "vitest";

import { logWarning } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("logWarning", () => {
  it("개발 서버에서는 메시지와 원인을 콘솔에 남긴다", () => {
    vi.stubEnv("MODE", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cause = new Error("원인");
    logWarning("저장 실패", cause);
    expect(warn).toHaveBeenCalledWith("저장 실패", cause);
  });

  it("운영 빌드와 테스트에서는 남기지 않는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarning("테스트에서는 조용하다");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    logWarning("운영에서도 조용하다");
    expect(warn).not.toHaveBeenCalled();
  });
});
