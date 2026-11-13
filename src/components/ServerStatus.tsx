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

/** 서버 상태(/health) 한 줄. 정상이면 검색이 붙은 Qdrant 의 위치(local · cloud)를 덧붙인다 (목업 서버는 없다) */
export function ServerStatus({ state }: ServerStatusProps) {
  const qdrant = state.kind === "ok" ? state.health.qdrant : null;
  return (
    <div role="status" className="space-y-0.5">
      <p className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        <span
          className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.kind]}`}
          aria-hidden="true"
        />
        {STATUS_TEXT[state.kind]}
      </p>
      {qdrant !== null ? (
        <p className="truncate pl-4 text-xs text-zinc-500">Qdrant ({qdrant})</p>
      ) : null}
    </div>
  );
}
