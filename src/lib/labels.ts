// 화면 표시 이름은 이 파일 한 곳에 모은다.
// (분류기 라벨이 나중에 enum 숫자로 바뀌어도 여기만 고친다)

import type { Label, Provider, Route, StatusStage, VerifyMode } from "../api/types";

/** 화면 테마 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** 오류 안내 문장과 다시 시도 버튼을 보일지 */
export interface ErrorGuide {
  text: string;
  /** false 면 다시 보내도 같은 결과라 다시 시도 버튼을 숨긴다 */
  retry: boolean;
}

export const PROVIDER_NAMES: Record<Provider, string> = {
  local: "로컬",
  openai: "OpenAI",
};

export const VERIFY_MODE_NAMES: Record<VerifyMode, string> = {
  off: "검증 끔",
  uncertain: "불확실할 때 검증",
  all: "항상 검증",
};

/** 서버 STAGE_MESSAGES 와 같은 문구 (status 이벤트 전 · 저장본 표시에 쓴다) */
export const STAGE_MESSAGES: Record<StatusStage, string> = {
  classifying: "문의를 분류하는 중...",
  answering: "답변을 작성하는 중...",
  adventure: "챗봇이 알 수 없는 것을 찾아 모험을 떠나는 중...",
};

export const THEME_NAMES: Record<Theme, string> = {
  system: "시스템",
  light: "라이트",
  dark: "다크",
};

const LABEL_NAMES: Partial<Record<string, string>> = {
  shipping: "배송",
  refund: "환불/반품",
  account: "계정",
  unknown: "범위 밖",
} satisfies Record<Label, string>;

const ROUTE_NAMES: Partial<Record<string, string>> = {
  confident: "확신",
  low_confidence: "확신 부족",
  ambiguous: "애매함",
  unknown: "범위 밖",
} satisfies Record<Route, string>;

/** 서버 툴 이름 (Seal_LLM llm/answer/tools) */
const TOOL_NAMES: Partial<Record<string, string>> = {
  get_today: "오늘 날짜",
  get_weekday: "요일 계산",
  get_date_of_weekday: "요일의 날짜",
  get_weather: "날씨",
  web_search: "웹 검색",
};

/** 오류 코드별 안내 (서버 error.code + 화면 쪽 AnswerStreamError code) */
const ERROR_GUIDES: Partial<Record<string, ErrorGuide>> = {
  config_error: { text: "서버 설정을 확인하세요 (분류 모델이나 API 키가 없습니다).", retry: true },
  llm_error: { text: "모델 서버(Ollama)가 꺼져 있을 수 있습니다.", retry: true },
  llm_timeout: { text: "응답 시간이 초과되었습니다.", retry: true },
  invalid_input: {
    text: "문의 내용을 확인하세요 (빈 문장이거나 2000자를 넘었습니다).",
    retry: false,
  },
  network: { text: "API 서버에 연결할 수 없습니다.", retry: true },
  incomplete: { text: "답변을 끝까지 받지 못했습니다 (연결이 끊겼습니다).", retry: true },
  bad_response: { text: "서버 응답 형식이 올바르지 않습니다.", retry: true },
};

const UNKNOWN_ERROR_GUIDE: ErrorGuide = { text: "알 수 없는 오류가 발생했습니다.", retry: true };

/** 분류 라벨 표시 이름. 모르는 라벨은 그대로 */
export function labelName(label: string): string {
  return LABEL_NAMES[label] ?? label;
}

/** 경로 규칙 판정 표시 이름. 모르는 값은 그대로 */
export function routeName(route: string): string {
  return ROUTE_NAMES[route] ?? route;
}

/** 툴 표시 이름. 모르는 툴은 그대로 */
export function toolName(name: string): string {
  return TOOL_NAMES[name] ?? name;
}

/** 오류 코드별 안내. 모르는 코드는 일반 안내 */
export function errorGuide(code: string): ErrorGuide {
  return ERROR_GUIDES[code] ?? UNKNOWN_ERROR_GUIDE;
}
