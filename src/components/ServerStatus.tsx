import type { HealthState } from "../hooks/useHealth";
import { VERIFY_MODE_NAMES } from "../lib/labels";

const DOT_CLASS: Record<HealthState["kind"], string> = {
  checking: "bg-zinc-400 animate-pulse",
  ok: "bg-emerald-500",
  classifier_error: "bg-amber-500",
  offline: "bg-red-500",
};

const STATUS_TEXT: Record<HealthState["kind"], string> = {
  checking: "확인 중...",
  ok: "서버 정상",
  classifier_error: "분류기 오류",
  offline: "연결 안 됨",
};

/** 사이드바 아래 서버 상태 (/health) */
export function ServerStatus({ state }: { state: HealthState }) {
  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-400" role="status" title={titleOf(state)}>
      <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
        <span
          className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.kind]}`}
          aria-hidden="true"
        />
        {STATUS_TEXT[state.kind]}
      </div>
      {"health" in state ? (
        <dl className="mt-1 space-y-0.5 pl-4">
          <div className="flex gap-1">
            <dt className="sr-only">분류기</dt>
            <dd className="truncate">
              분류기 {state.health.classifier ?? "없음"}
              {state.health.classifierDevice ? ` · ${state.health.classifierDevice}` : null}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">검증 모드</dt>
            <dd>{VERIFY_MODE_NAMES[state.health.verifyMode]}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

/** 마우스를 올렸을 때 보일 자세한 이유 */
function titleOf(state: HealthState): string | undefined {
  switch (state.kind) {
    case "classifier_error":
      return state.health.classifierError ?? undefined;
    case "offline":
      return `API 서버에 연결할 수 없습니다 (${state.reason})`;
    default:
      return undefined;
  }
}
