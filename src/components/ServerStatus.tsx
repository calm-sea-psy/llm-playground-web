import type { HealthState } from "../hooks/useHealth";

const DOT_CLASS: Record<HealthState["kind"], string> = {
  checking: "bg-zinc-400 animate-pulse",
  ok: "bg-emerald-500",
  index_not_ready: "bg-amber-500",
  offline: "bg-red-500",
};

// 화면은 백엔드가 질문을 받을 수 있는지만 알면 된다. 인덱스가 없으면(index_ready=false) "준비 중"으로 묶는다
const STATUS_TEXT: Record<HealthState["kind"], string> = {
  checking: "확인 중...",
  ok: "서버 정상",
  index_not_ready: "서버 준비 중",
  offline: "연결 안 됨",
};

interface ServerStatusProps {
  state: HealthState;
}

/** 사이드바 아래 백엔드 서버 상태 (/health) 한 줄. 연결이 안 되면 이유를 덧붙인다 */
export function ServerStatus({ state }: ServerStatusProps) {
  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-400" role="status">
      <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
        <span
          className={`size-2 shrink-0 rounded-full ${DOT_CLASS[state.kind]}`}
          aria-hidden="true"
        />
        {STATUS_TEXT[state.kind]}
      </div>
      {/* 자세한 이유. 키보드 · 스크린 리더로도 볼 수 있게 글로 보여 준다 */}
      {state.kind === "offline" ? (
        <p className="mt-1 pl-4 break-words">API 서버에 연결할 수 없습니다 ({state.reason})</p>
      ) : null}
    </div>
  );
}
