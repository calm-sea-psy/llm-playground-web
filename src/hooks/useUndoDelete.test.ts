// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatHistory } from "./useChatHistory";
import { UNDO_DELETE_MS, useUndoDelete } from "./useUndoDelete";
import type { Conversation } from "../lib/chat";
import { HISTORY_KEY } from "../lib/history";
import { fakeApiClient } from "../test/fakeApi";
import { providersWith } from "../test/providersWith";

function conversation(id: string, updatedAt: number): Conversation {
  return { id, title: id, createdAt: updatedAt, updatedAt, messages: [] };
}

function setup() {
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify({
      version: 2,
      conversations: [conversation("a", 3), conversation("b", 2), conversation("c", 1)],
    }),
  );
  return renderHook(
    () => {
      const chatHistory = useChatHistory();
      return { ...chatHistory, ...useUndoDelete(chatHistory) };
    },
    { wrapper: providersWith(fakeApiClient()) },
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useUndoDelete", () => {
  it("지우면 목록에서 빠지고, 실행 취소하면 같은 자리로 돌아온다", () => {
    const { result } = setup();
    act(() => result.current.remove("b"));
    expect(result.current.history.conversations.map((c) => c.id)).toEqual(["a", "c"]);
    expect(result.current.lastDeleted?.id).toBe("b");

    act(() => result.current.undoRemove());
    expect(result.current.history.conversations.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(result.current.lastDeleted).toBeUndefined();
  });

  it(`${UNDO_DELETE_MS}ms 가 지나면 실행 취소를 받지 않는다`, () => {
    const { result } = setup();
    act(() => result.current.remove("b"));
    act(() => {
      vi.advanceTimersByTime(UNDO_DELETE_MS);
    });
    expect(result.current.lastDeleted).toBeUndefined();

    act(() => result.current.undoRemove());
    expect(result.current.history.conversations.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("없는 id 는 아무 일도 없다", () => {
    const { result } = setup();
    act(() => result.current.remove("없음"));
    expect(result.current.history.conversations).toHaveLength(3);
    expect(result.current.lastDeleted).toBeUndefined();
  });
});
