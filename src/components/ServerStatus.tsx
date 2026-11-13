import type { HealthState } from "../hooks/useHealth";

const DOT_CLASS: Record<HealthState["kind"], string> = {
  checking: "bg-zinc-400 motion-safe:animate-pulse",
  ok: "bg-emerald-500",
  offline: "bg-red-500",
};

const STATUS_TEXT: Record<HealthState["kind"], string> = {
  checking: "확인 중...",
  ok: "서버 정상",
  offline: "연결 안 됨",
};

interface ServerStatusProps {
  state: HealthState;
}

/** 서버 상태(/health) 한 줄. 정상이면 검색 대상 컬렉션과 색인한 청크 수를 덧붙인다 */
export function ServerStatus({ state }: ServerStatusProps) {
  return (
    <div role="status" className="space-y-0.5">
      <p className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        <span
          className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.kind]}`}
          aria-hidden="true"
        />
        {STATUS_TEXT[state.kind]}
      </p>
      {state.kind === "ok" ? (
        <p className="truncate pl-4 text-xs text-zinc-500">
          {state.health.collection} · 청크 {state.health.chunks.toLocaleString("ko-KR")}개
        </p>
      ) : null}
    </div>
  );
}
