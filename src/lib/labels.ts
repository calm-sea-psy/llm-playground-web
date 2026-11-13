// 화면 표시 이름은 이 파일 한 곳에 모은다.

import type { AnswerCut } from "./chat";
import type { SaveResult } from "./history";
import type { RequestErrorCode } from "../api/client";
import type { AskMode, ErrorEventCode } from "../api/types";

/** 화면 테마: 시스템 설정을 따르기 · 라이트 · 다크 */
export const THEMES = ["system", "light", "dark"] as const;
/** THEMES 의 값 하나 */
export type Theme = (typeof THEMES)[number];

/** 화면 테마 표시 이름 */
export const THEME_NAMES: Record<Theme, string> = {
  system: "시스템",
  light: "라이트",
  dark: "다크",
};

/** 답변 방식 표시 이름 (계약 /ask 의 mode) */
export const ASK_MODE_NAMES: Record<AskMode, string> = {
  single: "단발",
  agent: "에이전트",
};

/** 대화 목록을 다 저장하지 못했을 때 사이드바 안내 */
export const SAVE_WARNING_TEXT: Record<Exclude<SaveResult, "saved">, string> = {
  trimmed: "보관 한도를 넘어 오래된 대화 일부를 저장하지 못했습니다",
  failed: "대화 목록을 저장하지 못했습니다 (브라우저 저장소를 쓸 수 없음)",
};

/** 첫 단계 안내가 오기 전 대기 문구 */
export const WAITING_TEXT = "질문을 보내는 중...";

/** 서버가 위키 문서와 일반 지식을 나눠 답했을 때(partial) 답 아래 안내 */
export const PARTIAL_NOTE = "위키백과 문서에 없는 내용은 일반 지식으로 답했습니다";

/** 답이 중간에 끊겼을 때 답 아래 안내 (done 의 truncated · timed_out · failed) */
export const CUT_TEXT: Record<AnswerCut, string> = {
  truncated: "답이 길이 한도에 닿아 중간에 끊겼습니다.",
  timed_out: "답을 만드는 시간이 초과되어 중간에 끊겼습니다.",
  failed: "답을 만드는 중에 문제가 생겨 중간에 끊겼습니다.",
};

/**
 * 서버가 error 이벤트로 실패를 알렸는데 문구가 비어 있을 때의 안내 (계약의 코드별). 문구가 있으면 서버 문구를 보여 준다.
 * 계약에 코드가 더해지면 여기서 타입 오류가 난다. 계약에 없는 코드는 UNKNOWN_ERROR_TEXT
 */
const ERROR_EVENT_TEXT: Readonly<Record<ErrorEventCode, string>> = {
  generation: "답을 만드는 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.",
  timeout: "답을 만드는 시간이 초과되었습니다. 잠시 뒤 다시 시도해 주세요.",
  internal: "서버에서 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.",
};

/** 서버가 오류를 알렸는데 문구도 코드도 모를 때의 안내 */
export const UNKNOWN_ERROR_TEXT = "알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.";

/**
 * 응답을 끝까지 받지 못한 이유별 사용자용 안내. 코드 자체는 로그용이라 화면에 보이지 않는다.
 * aborted 는 오류가 아니라 중지로 그려 안내가 없다
 */
export const REQUEST_ERROR_TEXT: Record<Exclude<RequestErrorCode, "aborted">, string> = {
  network: "서버에 연결하지 못했습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.",
  interrupted: "답을 받는 중에 연결이 끊겼습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.",
  timeout:
    "서버가 오래 응답하지 않아 기다리기를 멈췄습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.",
  bad_response: "서버 응답을 읽지 못했습니다. 다시 시도해 주세요.",
  invalid_question: "질문을 확인해 주세요 (비어 있거나 너무 깁니다).",
  invalid_mode: "답변 방식이 올바르지 않습니다. 다른 방식을 골라 다시 보내 주세요.",
  invalid_request: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
};

// 서버가 준 코드가 계약에 있는 코드인지. constructor 같은 값이 Object 의 속성을 집지 않게 자기 키만 본다
function isKnownErrorCode(code: string): code is ErrorEventCode {
  return Object.hasOwn(ERROR_EVENT_TEXT, code);
}

/** error 이벤트의 화면 문구: 서버 문구, 비어 있으면 코드별 안내, 모르는 코드면 일반 안내 */
export function errorEventText(code: string, message: string): string {
  if (message.trim() !== "") {
    return message;
  }
  return isKnownErrorCode(code) ? ERROR_EVENT_TEXT[code] : UNKNOWN_ERROR_TEXT;
}
