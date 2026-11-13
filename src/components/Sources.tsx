import type { Source } from "../api/types";
import { sourceHref, sourceLabel } from "../lib/sources";

interface SourcesProps {
  /** number 오름차순 (서버가 정한 순서 그대로) */
  sources: Source[];
  /** 답에 나온 출처 번호. 있으면 나오지 않은 출처를 흐리게 그린다 (답을 다 받기 전에는 없다) */
  cited?: number[];
}

interface SourceLabelProps {
  source: Source;
}

function SourceLabel({ source }: SourceLabelProps) {
  const href = sourceHref(source);
  const label = sourceLabel(source);
  if (href === undefined) {
    return <span>{label}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-zinc-300 underline-offset-2 hover:decoration-current dark:decoration-zinc-600"
    >
      {label}
    </a>
  );
}

/** 출처 목록: "[n] 위키백과 문서 › 섹션" 꼴의 링크와 리랭커 관련도. 답 속 [n] 과 같은 번호다 */
export function Sources({ sources, cited }: SourcesProps) {
  return (
    <section className="space-y-1 text-sm" aria-label="출처">
      <h3 className="text-xs font-semibold text-zinc-500">출처</h3>
      <ol className="space-y-0.5">
        {sources.map((source) => {
          const isUncited = cited !== undefined && !cited.includes(source.number);
          return (
            <li
              key={source.number}
              className={`flex items-baseline gap-2 text-zinc-700 dark:text-zinc-300 ${isUncited ? "opacity-60" : ""}`}
            >
              <span className="shrink-0 text-xs text-zinc-500 tabular-nums">[{source.number}]</span>
              <span className="min-w-0 break-words">
                <SourceLabel source={source} />
                {isUncited ? <span className="sr-only"> (답에 나오지 않음)</span> : null}
              </span>
              <span
                className="ml-auto shrink-0 text-xs text-zinc-400 tabular-nums"
                title="리랭커 관련도 (0~1)"
              >
                {source.score.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
