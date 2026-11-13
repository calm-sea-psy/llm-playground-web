import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Source } from "../../api/types";
import { remarkCitations } from "../../lib/citations";

// 원시 HTML 은 그리지 않는다 (rehype-raw 를 쓰지 않음 → <script> 등은 글자 그대로). 위험한 주소(javascript: 등)는
// react-markdown 의 기본 urlTransform 이 비운다.
const COMPONENTS: Components = {
  // 출처 번호 링크(remarkCitations 가 data-citation 을 붙인다)는 위 첨자로, 그 밖의 링크는 새 탭으로 연다
  a: ({ node, children, ...props }) => {
    const isCitation = node?.properties.dataCitation === true;
    return (
      <a
        {...props}
        target="_blank"
        rel="noreferrer"
        className={
          isCitation
            ? "align-super text-[0.7em] font-medium text-sky-700 no-underline hover:underline dark:text-sky-400"
            : undefined
        }
      >
        {children}
      </a>
    );
  },
  // 외부 이미지는 불러오지 않고 링크로만 (답에 나올 일이 거의 없고, 외부 요청을 막는다)
  img: ({ src, alt }) =>
    typeof src === "string" && src ? (
      <a href={src} target="_blank" rel="noreferrer">
        {alt === undefined || alt === "" ? src : alt}
      </a>
    ) : null,
  // 넓은 표는 표 영역만 가로 스크롤
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};

interface AnswerTextProps {
  text: string;
  /** 답 속 [n] 을 링크로 바꿀 출처 */
  sources: Source[];
  /** 아직 받는 중이면 끝에 깜박이는 커서를 붙인다 */
  isStreaming: boolean;
}

/**
 * 답 본문. 서버가 흘려 보낸 글을 마크다운(GFM)으로 그리고 (partial 답은 "###" 칸 제목을 쓴다),
 * 출처 번호 [n] 은 그 출처의 위키백과 문서로 잇는다. 줄바꿈 한 번도 줄바꿈으로 보인다
 */
export function AnswerText({ text, sources, isStreaming }: AnswerTextProps) {
  return (
    <div className="prose prose-sm max-w-none break-words prose-zinc dark:prose-invert prose-headings:mt-4 prose-headings:mb-1 prose-headings:text-sm prose-p:my-2 prose-p:leading-7 prose-li:my-0.5 [&_li]:whitespace-pre-line [&_p]:whitespace-pre-line">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkCitations, sources]]}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
      {isStreaming ? (
        <span aria-hidden="true" className="text-zinc-400 motion-safe:animate-pulse">
          ▍
        </span>
      ) : null}
    </div>
  );
}
