// 답변 복사용 평문 · HTML 만들기

/** 이 요소 바로 아래의 공백 글자는 구조용(react-markdown이 넣는 줄바꿈)이라 버린다 */
const STRUCTURAL = new Set(["UL", "OL", "TABLE", "THEAD", "TBODY", "TFOOT", "TR"]);

const BLOCKS = new Set([
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "PRE",
  "BLOCKQUOTE",
  "TABLE",
  "TR",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
]);

/**
 * 렌더링된 답변(DOM)을 붙여 넣기 좋은 평문으로 바꾼다.
 * 굵게 · 제목 기호는 지우고, 목록은 "- " · "1. "을 남기고, 표는 칸을 탭으로 나눈다.
 * data-copy-ignore 요소(코드 블록 복사 버튼 등)는 뺀다.
 */
export function toPlainText(root: HTMLElement): string {
  const out: string[] = [];
  const newline = (count = 1): void => {
    const tail = /\n*$/.exec(out.join(""))?.[0].length ?? 0;
    if (out.length && tail < count) {
      out.push("\n".repeat(count - tail));
    }
  };

  const walk = (node: Node, depth: number): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (!text.trim() && STRUCTURAL.has(node.parentElement?.tagName ?? "")) {
        return;
      }
      out.push(text);
      return;
    }
    if (!(node instanceof HTMLElement) || node.hasAttribute("data-copy-ignore")) {
      return;
    }
    const tag = node.tagName;
    if (tag === "BR") {
      out.push("\n");
      return;
    }
    if (tag === "HR") {
      newline(2);
      out.push("---");
      newline(2);
      return;
    }
    if (tag === "PRE") {
      newline(2);
      out.push(node.textContent.replace(/\n$/, ""));
      newline(2);
      return;
    }
    if (tag === "LI") {
      newline();
      const parent = node.parentElement;
      const index = parent ? Array.from(parent.children).indexOf(node) : 0;
      const start = parent instanceof HTMLOListElement ? parent.start || 1 : 1;
      out.push("  ".repeat(depth) + (parent?.tagName === "OL" ? `${start + index}. ` : "- "));
      node.childNodes.forEach((child) => walk(child, depth + 1));
      newline();
      return;
    }
    if (tag === "TR") {
      newline();
      const cells = Array.from(node.children).map((cell) => cell.textContent.trim());
      out.push(cells.join("\t"));
      newline();
      return;
    }
    const block = BLOCKS.has(tag);
    const listLike = tag === "UL" || tag === "OL";
    if (block) {
      newline(listLike && depth > 0 ? 1 : 2);
    }
    node.childNodes.forEach((child) => walk(child, depth));
    if (block) {
      newline(listLike && depth > 0 ? 1 : 2);
    }
  };

  root.childNodes.forEach((child) => walk(child, 0));
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 렌더링된 답변을 붙여 넣기용 HTML로 (class · data-copy-ignore 요소 제거) */
export function toCopyHtml(root: HTMLElement): string {
  // cloneNode 의 타입은 Node 지만 HTMLElement 를 복제하면 HTMLElement 다
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-copy-ignore]").forEach((el) => el.remove());
  clone.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
  return clone.innerHTML;
}
