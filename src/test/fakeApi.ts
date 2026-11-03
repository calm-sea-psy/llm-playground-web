// 테스트용 가짜 API 클라이언트
import { vi } from "vitest";

import type { ApiClient } from "../api/client";

/** 기본은 둘 다 실패(서버 꺼짐). 필요한 메서드만 바꿔 끼운다 */
export function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getHealth: vi.fn(() => Promise.reject(new Error("Failed to fetch"))),
    answerStream: vi.fn(() => Promise.reject(new Error("Failed to fetch"))),
    ...overrides,
  };
}
