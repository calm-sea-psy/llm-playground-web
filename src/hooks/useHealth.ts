import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "./useApi";
import type { HealthResponse } from "../api/types";
import { HEALTH_INTERVAL_MS } from "../lib/config";

/** 서버 상태 확인 결과 */
export type HealthState =
  | { kind: "checking" }
  | { kind: "ok"; health: HealthResponse }
  /** 서버는 떴지만 검색 인덱스가 준비되지 않음 (index_ready=false). 질문은 index_not_ready 오류가 된다 */
  | { kind: "index_not_ready"; health: HealthResponse }
  | { kind: "offline"; reason: string };

/** useHealth 가 돌려주는 상태와 동작 */
export interface UseHealthResult {
  health: HealthState;
  /** 지금 바로 확인 (질문 요청이 network 오류로 실패했을 때 서버 상태를 맞추려고) */
  recheck: () => void;
}

/** /health 를 주기적으로 확인한다. 탭이 다시 보이면 바로 한 번 더 확인한다 */
export function useHealth(): UseHealthResult {
  const api = useApi();
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const checkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function check(): Promise<void> {
      try {
        const result = await api.getHealth(controller.signal);
        setHealth({ kind: result.indexReady ? "ok" : "index_not_ready", health: result });
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setHealth({ kind: "offline", reason: e instanceof Error ? e.message : String(e) });
      }
    }
    const checkNow = (): void => void check();
    checkRef.current = checkNow;

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        checkNow();
      }
    }

    checkNow();
    const timer = setInterval(checkNow, HEALTH_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [api]);

  const recheck = useCallback(() => checkRef.current?.(), []);
  return { health, recheck };
}
