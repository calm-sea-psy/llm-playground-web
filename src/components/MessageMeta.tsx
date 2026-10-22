import type { ReactNode } from "react";

import type { AnswerResponse, RoutingResult, ToolCall } from "../api/types";
import { labelName, PROVIDER_NAMES, routeName, toolName } from "../lib/labels";

type BadgeTone = "default" | "warn" | "tool";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  tool: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

/** 표의 한 줄: [이름, 값] */
type Row = [string, string];

interface MessageMetaProps {
  meta: AnswerResponse;
  /** done 전에 받은 classification (meta.classification 이 없을 때) */
  classification?: RoutingResult;
  /** 화면에서 잰 전체 시간 (보낸 때 → done, 분류 · 검증 포함) */
  totalMs?: number;
}

/** 답변 아래 배지 + "처리 과정" 펼침 (분류기 확률 · 경로 규칙 · LLM 검증 · 툴 호출 · 토큰) */
export function MessageMeta({ meta, classification: early, totalMs }: MessageMetaProps) {
  const classification = meta.classification ?? early ?? null;
  const route = classification?.route ?? null;
  const verification = classification?.verification ?? null;
  const modelShort = meta.model.split("/").at(-1) ?? meta.model;
  const modelName = `${PROVIDER_NAMES[meta.provider]} · ${modelShort}`;
  // 범위 밖 문의는 라벨과 경로 이름이 같다 → 한 번만
  const showRoute = route !== null && routeName(route.route) !== labelName(meta.label);
  // 툴 호출은 같은 툴이 여러 번 나올 수 있고 순서가 바뀌지 않아 순번을 키에 쓴다
  const tools = meta.toolsUsed.map((tool, i) => ({ key: `${tool.name}-${i}`, tool }));

  return (
    <details className="group min-w-0 text-xs text-zinc-500">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-md py-0.5 select-none [&::-webkit-details-marker]:hidden">
        <Badge isStrong>{labelName(meta.label)}</Badge>
        {showRoute ? <Badge>{routeName(route.route)}</Badge> : null}
        {verification ? (
          <Badge tone={verification.match ? "default" : "warn"}>
            {verification.match
              ? "검증 일치"
              : `검증 후 변경 → ${labelName(verification.finalLabel)}`}
          </Badge>
        ) : null}
        <Badge>{seconds(meta.latencyMs)}</Badge>
        {tools.map(({ key, tool }) => (
          <Badge key={key} tone={tool.ok ? "tool" : "warn"}>
            {toolName(tool.name)}
            {tool.ok ? null : " 실패"}
          </Badge>
        ))}
        <span className="min-w-0 truncate" title={meta.model}>
          {modelName}
        </span>
        <span className="ml-1 text-zinc-400 group-open:hidden">처리 과정 ▸</span>
        <span className="ml-1 hidden text-zinc-400 group-open:inline">처리 과정 ▾</span>
      </summary>

      <div className="mt-2 grid gap-3 rounded-lg border border-zinc-200 p-3 text-zinc-600 sm:grid-cols-2 dark:border-zinc-800 dark:text-zinc-400">
        {classification ? (
          <Section title="분류기 확률 (보정 전)">
            <Scores scores={classification.scores} label={classification.classifierLabel} />
            {classification.classifierLabel === classification.label ? null : (
              <p className="mt-1">
                분류기 {labelName(classification.classifierLabel)} → 최종{" "}
                {labelName(classification.label)}
              </p>
            )}
          </Section>
        ) : null}
        {route ? (
          <Section title="경로 규칙">
            <Rows
              rows={[
                ["경로", routeName(route.route)],
                ["1위 확률 (p1, 보정 후)", percent(route.p1)],
                ["1·2위 차이 (margin)", percent(route.margin)],
                ["판정 이유", route.reason || "-"],
              ]}
            />
          </Section>
        ) : null}
        {verification ? (
          <Section title="LLM 검증">
            <Rows
              rows={[
                ["결과", verification.match ? "일치" : "불일치"],
                ["최종 라벨", labelName(verification.finalLabel)],
                ["근거", verification.reason || "-"],
                ["시간", seconds(verification.latencyMs)],
                ...optionalRow("오류", verification.error),
              ]}
            />
          </Section>
        ) : null}
        {tools.length > 0 ? (
          <Section title="툴 호출">
            <ul className="space-y-1.5">
              {tools.map(({ key, tool }) => (
                <ToolCallItem key={key} tool={tool} />
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="답변">
          <Rows
            rows={[
              ["답변 생성", seconds(meta.latencyMs)],
              ...optionalRow(
                "전체 (분류 · 검증 포함)",
                totalMs === undefined ? null : seconds(totalMs),
              ),
              [
                "토큰 (입력 / 출력)",
                `${meta.usage.inputTokens ?? "-"} / ${meta.usage.outputTokens ?? "-"}`,
              ],
              ["모델", `${PROVIDER_NAMES[meta.provider]} · ${meta.model}`],
              ["프롬프트 버전", meta.promptVersion],
              ["요청 id", meta.requestId],
            ]}
          />
        </Section>
      </div>
    </details>
  );
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}초`;
}

function percent(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

/** 값이 있을 때만 한 줄 */
function optionalRow(name: string, value: string | null): Row[] {
  return value === null ? [] : [[name, value]];
}

function Badge({
  children,
  isStrong = false,
  tone = "default",
}: {
  children: ReactNode;
  isStrong?: boolean;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 ${isStrong ? "font-semibold" : ""} ${BADGE_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">{title}</h4>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-zinc-400">{name}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ToolCallItem({ tool }: { tool: ToolCall }) {
  return (
    <li>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{toolName(tool.name)}</span>{" "}
      <code className="text-[11px]">{tool.name}</code> · {tool.ok ? "성공" : "실패"} ·{" "}
      {seconds(tool.latencyMs)}
      {Object.keys(tool.args).length > 0 ? (
        <div className="font-mono text-[11px] break-all">{JSON.stringify(tool.args)}</div>
      ) : null}
      {tool.error ? <div className="text-red-600 dark:text-red-400">{tool.error}</div> : null}
    </li>
  );
}

function Scores({ scores, label }: { scores: Record<string, number>; label: string }) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="space-y-1">
      {sorted.map(([name, p]) => {
        const isChosen = name === label;
        return (
          <li key={name} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
            <span className={isChosen ? "font-semibold text-zinc-700 dark:text-zinc-300" : ""}>
              {labelName(name)}
            </span>
            <span
              className="h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"
              aria-hidden="true"
            >
              <span
                className={`block h-full rounded ${isChosen ? "bg-zinc-600 dark:bg-zinc-300" : "bg-zinc-400 dark:bg-zinc-600"}`}
                // 막대 길이는 확률 값에 따라 정해지는 동적 값이라 인라인으로 둔다
                style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{percent(p)}</span>
          </li>
        );
      })}
    </ul>
  );
}
