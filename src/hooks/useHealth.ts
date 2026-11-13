import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useApi } from "./useApi";
import type { HealthResponse } from "../api/types";
import { HEALTH_INTERVAL_MS } from "../lib/config";

/** 서버 상태 질의 키 */
const HEALTH_QUERY_KEY = ["health"] as const;

/** 서버 상태 확인 결과 */
export type HealthState =
  { kind: "checking" } | { kind: "ok"; health: HealthResponse } | { kind: "offline" };

/** useHealth 가 돌려주는 서버 상태와 동작 */
export interface UseHealthResult {
  health: HealthState;
  /** 지금 다시 확인한다 (질문이 서버 문제로 실패했을 때). 확인 중이던 요청은 끊고 그 결과는 버린다 */
  recheck: () => void;
}

/**
 * /health 를 HEALTH_INTERVAL_MS 마다 확인한다.
 * 탭이 숨겨진 동안은 쉬고(refetchIntervalInBackground 기본값), 다시 보이면 바로 확인한다(refetchOnWindowFocus)
 */
export function useHealth(): UseHealthResult {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: ({ signal }) => api.getHealth(signal),
    refetchInterval: HEALTH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    // 연결 실패는 바로 "연결 안 됨"으로 보인다. 다음 주기에 다시 확인한다
    retry: false,
    // 브라우저가 오프라인이라고 해도 요청을 멈추지 않는다 (멈추면 "서버 정상"이 그대로 남는다)
    networkMode: "always",
  });

  // useChat 의 답변 받기 콜백이 부르므로 렌더마다 새로 만들지 않는다
  const recheck = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HEALTH_QUERY_KEY });
  }, [queryClient]);

  if (query.isPending) {
    return { health: { kind: "checking" }, recheck };
  }
  if (query.isError) {
    // 원인은 httpClient 의 RequestError 에 있고, 화면에는 "연결 안 됨"만 보인다
    return { health: { kind: "offline" }, recheck };
  }
  return { health: { kind: "ok", health: query.data }, recheck };
}
