// 테스트용 가짜 API 클라이언트와 Provider 래퍼
import type { ReactNode } from "react";
import { vi } from "vitest";

import type { ApiClient } from "../api/client";
import { ApiProvider } from "../providers/ApiProvider";
import { TypewriterMemoryProvider } from "../providers/TypewriterMemoryProvider";

/** 기본은 둘 다 실패(서버 꺼짐). 필요한 메서드만 바꿔 끼운다 */
export function fakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getHealth: vi.fn(() => Promise.reject(new Error("Failed to fetch"))),
    answerStream: vi.fn(() => Promise.reject(new Error("Failed to fetch"))),
    ...overrides,
  };
}

/** render · renderHook 의 wrapper: 앱 루트와 같은 Provider 를 감싼다 */
export function providersWith(client: ApiClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <ApiProvider client={client}>
        <TypewriterMemoryProvider>{children}</TypewriterMemoryProvider>
      </ApiProvider>
    );
  };
}
