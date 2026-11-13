// 답 속 출처 번호 "[n]" 을 마크다운 트리(mdast)에서 출처 링크로 바꾸는 remark 플러그인. React 를 쓰지 않는다.

import { sourceHref, sourceLabel } from "./sources";
import type { Source } from "../api/types";

/** 출처 번호 표시. split 에 쓰려고 번호를 묶는다 */
const CITATION_PATTERN = /\[(\d+)\]/;

/** 안의 글을 바꾸지 않는 노드: 이미 링크이거나 코드다 */
const SKIPPED_TYPES: ReadonlySet<string> = new Set([
  "link",
  "linkReference",
  "definition",
  "code",
  "inlineCode",
]);

/** 이 플러그인이 다루는 마크다운 트리 노드 (mdast 에서 쓰는 부분만) */
export interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string | boolean> };
}

// 글 하나를 글 · 출처 링크 노드들로 나눈다. 출처가 없는 번호(범위 밖 · 아직 못 받음)는 글 그대로 둔다
function splitText(value: string, sources: Source[]): MarkdownNode[] {
  const parts = value.split(CITATION_PATTERN);
  if (parts.length === 1) {
    return [{ type: "text", value }];
  }
  const nodes: MarkdownNode[] = [];
  const pushText = (text: string): void => {
    const last = nodes.at(-1);
    if (last?.type === "text") {
      last.value = `${last.value ?? ""}${text}`;
    } else if (text !== "") {
      nodes.push({ type: "text", value: text });
    }
  };
  parts.forEach((part, i) => {
    // split 에 묶음이 있어 홀수 자리는 번호다 (["앞 글", "1", "뒷 글", …])
    if (i % 2 === 0) {
      pushText(part);
      return;
    }
    const source = sources.find((s) => s.number === Number(part));
    const href = source && sourceHref(source);
    if (!source || href === undefined) {
      pushText(`[${part}]`);
      return;
    }
    nodes.push({
      type: "link",
      url: href,
      title: sourceLabel(source),
      children: [{ type: "text", value: `[${part}]` }],
      data: { hProperties: { dataCitation: true } },
    });
  });
  return nodes;
}

// 글 노드를 출처 링크로 나눈 새 트리. 받은 트리는 바꾸지 않는다
function withCitations(node: MarkdownNode, sources: Source[]): MarkdownNode {
  if (SKIPPED_TYPES.has(node.type) || node.children === undefined) {
    return node;
  }
  return {
    ...node,
    children: node.children.flatMap((child) =>
      child.type === "text"
        ? splitText(child.value ?? "", sources)
        : [withCitations(child, sources)],
    ),
  };
}

/**
 * remark 플러그인: 답 속 [n] 중 출처가 있는 번호를 그 출처의 위키백과 문서 링크로 바꾼다.
 * 코드 · 이미 링크인 곳은 그대로 둔다. 바꾼 링크는 data-citation 속성으로 알아볼 수 있다
 *
 * @param sources 답에 딸린 출처 (sources 이벤트)
 * @returns 새 트리를 돌려주는 변환 (unified 는 돌려준 트리로 바꾼다)
 */
export function remarkCitations(sources: Source[]): (tree: MarkdownNode) => MarkdownNode {
  return (tree) => withCitations(tree, sources);
}
