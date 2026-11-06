import type { ReactNode } from "react";

import { CopyButton } from "./CopyButton";
import type { QueryResponse } from "../api/types";
import { copyText } from "../lib/clipboard";
import { RETRIEVAL_MODE_NAMES } from "../lib/labels";

interface MessageMetaProps {
  response: QueryResponse;
  /** 화면에서 잰 전체 시간 (보낸 때 → 응답). 서버 시간이 없을 때 대신 보인다 */
  totalMs?: number;
}

interface BadgeProps {
  /** 마우스를 올렸을 때 · 스크린 리더용 설명 */
  label: string;
  children: ReactNode;
}

/** 답변 아래 한 줄: 검색 방식 · 캐시 · 응답 시간 · 토큰 · 요청 ID(복사, Langfuse 조회용) */
export function MessageMeta({ response, totalMs }: MessageMetaProps) {
  const { retrievalMode, latencyMs, inputTokens, outputTokens, cacheHit } = response.meta;
  const ms = latencyMs ?? totalMs;
  const hasTokens = inputTokens !== null || outputTokens !== null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      <Badge label="검색 방식">{RETRIEVAL_MODE_NAMES[retrievalMode]}</Badge>
      {cacheHit ? <Badge label="캐시에서 꺼낸 응답">캐시</Badge> : null}
      {ms === undefined ? null : (
        <Badge label={latencyMs === null ? "화면에서 잰 전체 시간" : "서버 응답 시간"}>
          {formatSeconds(ms)}
        </Badge>
      )}
      {hasTokens ? (
        <Badge label="입력 · 출력 토큰">
          토큰 {formatCount(inputTokens)} / {formatCount(outputTokens)}
        </Badge>
      ) : null}
      <span className="inline-flex min-w-0 items-center gap-0.5">
        <span className="sr-only">요청 ID: </span>
        <span className="truncate font-mono text-[11px]" title="요청 ID">
          {response.requestId}
        </span>
        <CopyButton ariaLabel="요청 ID 복사" onCopy={() => copyText(response.requestId)} />
      </span>
    </div>
  );
}

function Badge({ label, children }: BadgeProps) {
  return (
    <span
      title={label}
      className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-700 tabular-nums dark:bg-zinc-800 dark:text-zinc-300"
    >
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}초`;
}

function formatCount(count: number | null): string {
  return count === null ? "—" : count.toLocaleString();
}
