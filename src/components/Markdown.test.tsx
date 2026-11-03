// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

function renderMarkdown(text: string) {
  render(<Markdown text={text} />);
}

/** 렌더링되지 않아야 할 태그를 찾을 때만 쓴다 (없는 요소에는 역할 · 글자 쿼리를 쓸 수 없다) */
function renderedContainer(text: string) {
  return render(<Markdown text={text} />).container;
}

describe("Markdown", () => {
  it("굵게 · 목록 · 표를 그린다", () => {
    renderMarkdown("**중요** 안내\n\n- 첫째\n- 둘째\n\n| 항목 | 기간 |\n|---|---|\n| 배송 | 3일 |");
    expect(screen.getByText("중요").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "배송" })).toBeTruthy();
    // 넓은 표는 표 영역만 가로 스크롤
    expect(screen.getByRole("table").parentElement?.className).toContain("overflow-x-auto");
  });

  it("원시 HTML은 렌더링하지 않는다 (글자로도 실행되지도 않음)", () => {
    const el = renderedContainer(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b>굵게</b>',
    );
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el.querySelector("[onerror]")).toBeNull();
  });

  it("javascript: 링크는 주소를 비운다", () => {
    renderMarkdown("[눌러 보세요](javascript:alert(1))");
    const a = screen.getByText("눌러 보세요");
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("링크는 새 탭에서 열고 opener를 넘기지 않는다", () => {
    renderMarkdown("[배송 조회](https://example.com/track)");
    const a = screen.getByRole("link", { name: "배송 조회" });
    expect(a.getAttribute("href")).toBe("https://example.com/track");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("이미지는 불러오지 않고 링크로만 보여 준다", () => {
    renderMarkdown("![택배 상자](https://example.com/box.png)");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "택배 상자" })).toBeTruthy();
  });

  it("코드 블록에 언어 이름과 복사 버튼을 붙이고, 인라인 코드는 그대로", () => {
    renderMarkdown("`npm` 명령:\n\n```bash\nnpm run dev\n```");
    expect(screen.getByText("npm").tagName).toBe("CODE");
    expect(screen.getByText("npm run dev").closest("pre")?.textContent).toBe("npm run dev\n");
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByRole("button", { name: "코드 복사" })).toBeTruthy();
  });
});
