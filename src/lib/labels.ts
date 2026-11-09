// 화면 표시 이름은 이 파일 한 곳에 모은다.

import type { QueryErrorCode } from "../api/client";
import { RETRIEVAL_MODES, type ErrorCode, type RetrievalMode } from "../api/types";

/** 화면 테마 */
export const THEMES = ["system", "light", "dark"] as const;
/** THEMES 의 값 하나 */
export type Theme = (typeof THEMES)[number];

/** 오류 안내 문장과 다시 시도 버튼을 보일지 */
export interface ErrorGuide {
  text: string;
  /** false 면 다시 보내도 같은 결과라 다시 시도 버튼을 숨긴다 */
  canRetry: boolean;
}

/** 검색 방식 표시 이름 */
export const RETRIEVAL_MODE_NAMES: Record<RetrievalMode, string> = {
  naive: "Dense",
  hybrid: "하이브리드",
  hybrid_rerank: "하이브리드 + 리랭킹",
};

/** 테마 표시 이름 */
export const THEME_NAMES: Record<Theme, string> = {
  system: "시스템",
  light: "라이트",
  dark: "다크",
};

/**
 * 오류 코드별 사용자용 안내 (서버 error_code + 화면 쪽 QueryError code).
 * 코드 자체는 로그용이라 화면에 보이지 않는다. aborted 는 오류가 아니라 중지로 그려 안내가 없다.
 */
const ERROR_GUIDES: Partial<Record<string, ErrorGuide>> = {
  index_not_ready: {
    text: "검색 인덱스가 아직 준비되지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
    canRetry: true,
  },
  retrieval_failed: { text: "자료를 검색하지 못했습니다. 다시 시도해 주세요.", canRetry: true },
  model_timeout: {
    text: "답변 생성 시간이 초과되었습니다. 잠시 뒤 다시 시도해 주세요.",
    canRetry: true,
  },
  model_failed: {
    text: "답변 생성 모델이 응답하지 못했습니다. 다시 시도해 주세요.",
    canRetry: true,
  },
  output_invalid: {
    text: "답변을 검증하지 못했습니다. 다시 시도해 주세요.",
    canRetry: true,
  },
  ingest_failed: {
    text: "문서 색인에 문제가 있어 답할 수 없습니다. 관리자에게 알려 주세요.",
    canRetry: false,
  },
  internal: { text: "서버에서 오류가 발생했습니다. 다시 시도해 주세요.", canRetry: true },
  network: {
    text: "API 서버에 연결할 수 없습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.",
    canRetry: true,
  },
  bad_response: { text: "서버 응답 형식이 올바르지 않습니다.", canRetry: true },
  invalid_question: { text: "질문을 확인해 주세요 (비어 있거나 너무 깁니다).", canRetry: false },
  invalid_retrieval_mode: {
    text: "검색 방식이 올바르지 않습니다. 다른 방식을 골라 다시 보내 주세요.",
    canRetry: false,
  },
  invalid_request: { text: "요청 형식이 올바르지 않습니다.", canRetry: false },
} satisfies Record<Exclude<QueryErrorCode, "aborted"> | ErrorCode, ErrorGuide>;

const UNKNOWN_ERROR_GUIDE: ErrorGuide = {
  text: "답변을 만들지 못했습니다. 다시 시도해 주세요.",
  canRetry: true,
};

/** 오류 코드별 안내. 모르는 코드(서버에 새로 생긴 코드 포함)는 일반 안내 */
export function errorGuide(code: string): ErrorGuide {
  // 코드는 서버가 준 문자열이라 constructor 같은 값이 Object 의 속성을 집지 않게 한다
  return (Object.hasOwn(ERROR_GUIDES, code) && ERROR_GUIDES[code]) || UNKNOWN_ERROR_GUIDE;
}

/** 검색 방식 표시 이름. 모르는 값은 서버가 준 그대로 */
export function retrievalModeName(mode: string): string {
  const known = RETRIEVAL_MODES.find((m) => m === mode);
  return known ? RETRIEVAL_MODE_NAMES[known] : mode;
}
