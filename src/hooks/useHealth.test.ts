// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHealth } from "./useHealth";
import type { Health } from "../api/types";
import { HEALTH_INTERVAL_MS } from "../lib/config";
import { fakeApiClient } from "../test/fakeApi";
import { providersWith } from "../test/providersWith";

const HEALTH: Health = {
  classifier: "klue-roberta",
  classifierDevice: "cuda",
  classifierError: null,
  routeRuleEnabled: true,
  verifyMode: "uncertain",
  defaultProvider: "local",
};

function setup(getHealth: () => Promise<Health>) {
  const spy = vi.fn(getHealth);
  const hook = renderHook(() => useHealth(), {
    wrapper: providersWith(fakeApiClient({ getHealth: spy })),
  });
  return { ...hook, getHealth: spy };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useHealth", () => {
  it("처음에는 확인 중이고, 응답이 오면 정상으로 바뀐다", async () => {
    const { result } = setup(() => Promise.resolve(HEALTH));
    expect(result.current.health).toEqual({ kind: "checking" });
    await waitFor(() => expect(result.current.health).toEqual({ kind: "ok", health: HEALTH }));
  });

  it("분류 모델 오류가 있으면 classifier_error", async () => {
    const health = { ...HEALTH, classifierError: "모델 없음" };
    const { result } = setup(() => Promise.resolve(health));
    await waitFor(() =>
      expect(result.current.health).toEqual({ kind: "classifier_error", health }),
    );
  });

  it("실패하면 offline 과 이유", async () => {
    const { result } = setup(() => Promise.reject(new Error("Failed to fetch")));
    await waitFor(() =>
      expect(result.current.health).toEqual({ kind: "offline", reason: "Failed to fetch" }),
    );
  });

  it("recheck 는 바로 다시 확인한다", async () => {
    const { result, getHealth } = setup(() => Promise.resolve(HEALTH));
    await waitFor(() => expect(result.current.health.kind).toBe("ok"));
    expect(getHealth).toHaveBeenCalledOnce();

    act(() => result.current.recheck());
    await waitFor(() => expect(getHealth).toHaveBeenCalledTimes(2));
  });

  it("주기마다 확인하고, 언마운트하면 멈춘다", async () => {
    // waitFor 가 setInterval 로 도는 탓에 가짜 타이머에서는 쓰지 못한다
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { result, getHealth, unmount } = setup(() => Promise.resolve(HEALTH));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.health.kind).toBe("ok");
    expect(getHealth).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(HEALTH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(getHealth).toHaveBeenCalledTimes(2);

    unmount();
    vi.advanceTimersByTime(HEALTH_INTERVAL_MS);
    expect(getHealth).toHaveBeenCalledTimes(2);
  });

  it("탭이 다시 보이면 바로 확인하고, 숨을 때는 확인하지 않는다", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const { result, getHealth } = setup(() => Promise.resolve(HEALTH));
    await waitFor(() => expect(result.current.health.kind).toBe("ok"));

    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getHealth).toHaveBeenCalledOnce();

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(getHealth).toHaveBeenCalledTimes(2));
    visibility.mockRestore();
  });
});
