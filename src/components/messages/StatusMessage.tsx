import { useNow } from "../../hooks/useNow";

/** 경과 시간 갱신 간격 */
const ELAPSED_TICK_MS = 1000;

interface ElapsedProps {
  since: number;
}

interface StatusMessageProps {
  /** 질문을 보낸 시각 (ms). 경과 시간 기준 */
  since: number;
}

/** 응답을 기다리는 동안: 안내 문구 + 경과 시간 + 스켈레톤 (검색 · 리랭킹 · 답변 생성에 수 초 걸린다) */
export function StatusMessage({ since }: StatusMessageProps) {
  return (
    <div role="status" className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span>자료를 찾아 답변을 만드는 중...</span>
        <Elapsed since={since} />
      </p>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3 w-11/12 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-3 w-4/5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
        <div className="h-3 w-3/5 rounded bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800" />
      </div>
    </div>
  );
}

function Elapsed({ since }: ElapsedProps) {
  const now = useNow(ELAPSED_TICK_MS);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  // role="status" 안에서 매초 바뀌므로 스크린 리더가 계속 읽지 않게 숨긴다
  return (
    <span className="text-xs text-zinc-400 tabular-nums" aria-hidden="true">
      {seconds}초
    </span>
  );
}
