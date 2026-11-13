// 출처(sources 이벤트의 문서 하나)를 화면에 보이는 이름 · 링크 주소로 바꾼다. React 를 쓰지 않는다.

import type { Source } from "../api/types";

/** 출처 이름: "문서 제목 › 섹션". 문서 첫머리(섹션이 빈 문자열)면 제목만 */
export function sourceLabel(source: Source): string {
  return source.section ? `${source.title} › ${source.section}` : source.title;
}

/** 출처 링크 주소. http · https 가 아니면(javascript: 등) 링크로 쓰지 않고 undefined */
export function sourceHref(source: Source): string | undefined {
  return /^https?:\/\//i.test(source.url) ? source.url : undefined;
}
