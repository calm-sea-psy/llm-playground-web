// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatHistory } from "./useChatHistory";
import type { Conversation } from "../lib/chat";
import { CURRENT_KEY, HISTORY_KEY } from "../lib/history";
import { fakeApiClient } from "../test/fakeApi";
import { providersWith } from "../test/providersWith";

const CONVERSATION: Conversation = {
  id: "a",
  title: "문의",
  createdAt: 1,
  updatedAt: 1,
  messages: [],
};

const wrapper = providersWith(fakeApiClient());

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useChatHistory", () => {
  it("저장을 바란 변경만 저장소에 쓴다", () => {
    const { result } = renderHook(() => useChatHistory(), { wrapper });

    act(() => result.current.updateHistory((h) => ({ ...h, conversations: [CONVERSATION] })));
    expect(result.current.history.conversations).toEqual([CONVERSATION]);
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();

    act(() => result.current.updateHistory((h) => h, true));
    expect(localStorage.getItem(HISTORY_KEY)).toContain('"id":"a"');
  });

  it("한 틱에 여러 번 바꿔도 앞 변경 위에 쌓이고, historyRef 는 바로 최신이다", () => {
    const { result } = renderHook(() => useChatHistory(), { wrapper });
    act(() => {
      result.current.updateHistory((h) => ({ ...h, conversations: [CONVERSATION] }));
      expect(result.current.historyRef.current.conversations).toHaveLength(1);
      result.current.updateHistory((h) => ({ ...h, currentId: h.conversations[0]?.id }));
    });
    expect(result.current.history.currentId).toBe("a");
  });

  it("보던 대화가 바뀌면 저장소에 남기고, 없으면 지운다", () => {
    const { result } = renderHook(() => useChatHistory(), { wrapper });
    act(() => result.current.updateHistory((h) => ({ ...h, currentId: "a" })));
    expect(localStorage.getItem(CURRENT_KEY)).toBe("a");

    act(() => result.current.updateHistory((h) => ({ ...h, currentId: undefined })));
    expect(localStorage.getItem(CURRENT_KEY)).toBeNull();
  });

  it("저장할 수 없으면 isStorageOk 가 false 가 되고 화면 상태는 바뀐다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const { result } = renderHook(() => useChatHistory(), { wrapper });
    expect(result.current.isStorageOk).toBe(true);

    act(() => result.current.updateHistory((h) => ({ ...h, conversations: [CONVERSATION] }), true));
    expect(result.current.isStorageOk).toBe(false);
    expect(result.current.history.conversations).toEqual([CONVERSATION]);
  });
});
