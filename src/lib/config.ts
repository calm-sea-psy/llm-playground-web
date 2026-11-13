// 설정값은 이 파일 한 곳에 모은다.

import { ASK_REQUEST_QUESTION_MAX_LENGTH, type AskMode } from "../api/types";

/** API 연결 방식: http = 실제 서버(llm-playground-wiki), mock = 서버 없이 계약 예시를 재생하는 목업 */
export type ApiMode = "http" | "mock";

// 정하지 않으면 개발 서버는 목업, 운영 빌드는 실제 서버 (설정을 빠뜨린 배포가 가짜 답을 내지 않게)
function apiModeOf(value: string | undefined, isDev: boolean): ApiMode {
  const trimmed = value?.trim();
  if (trimmed === "http" || trimmed === "mock") {
    return trimmed;
  }
  return isDev ? "mock" : "http";
}

/** API 연결 방식. VITE_API_MODE(http · mock)로 정하고, 비우면 개발 서버는 mock, 운영 빌드는 http 다 */
export const API_MODE: ApiMode = apiModeOf(import.meta.env.VITE_API_MODE, import.meta.env.DEV);

/** API 주소 (http 모드). 비우면 같은 주소의 상대 경로(개발 중에는 Vite 프록시)로 보낸다 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** /health 응답 대기 한도 (넘으면 서버에 닿지 못한 것으로 본다) */
export const READ_TIMEOUT_MS = 5_000;

/**
 * /ask 에서 서버가 아무것도 보내지 않을 때 기다리는 한도. 받을 때마다 다시 잰다.
 * wiki 의 단계 시간 제한(configs/answer.yaml 의 timeout_sec 60초)보다 넉넉하고, nginx 의 proxy_read_timeout(120초)이 먼저 끊도록 조금 길게 둔다
 */
export const STREAM_IDLE_TIMEOUT_MS = 130_000;

/** /health 확인 주기 */
export const HEALTH_INTERVAL_MS = 30_000;

/** 답변 대기 표시를 이만큼 기다린 뒤에 보여 준다. 그 안에 답이 오면 그리지 않는다 (번쩍임 방지) */
export const PENDING_SHOW_DELAY_MS = 300;

/** 답변 대기 표시가 한번 보이면 최소 이만큼은 둔다. 나타나자마자 사라지지 않게 한다 */
export const PENDING_MIN_VISIBLE_MS = 500;

/**
 * 처음 고른 답변 방식. 에이전트 모드는 단발로 먼저 답하고, 못 찾았거나 부분 답 구간일 때만
 * 에이전트 그래프(질문 나누기 → 검색 → 판단)로 넘어간다. 쉬운 질문은 단발과 같고 복합 질문만 더 걸린다
 */
export const DEFAULT_ASK_MODE: AskMode = "agent";

/** 대화 목록 저장소 키. 저장 모양이 바뀌면 버전을 올린다 (v1 은 /query 시절 모양) */
export const HISTORY_STORAGE_KEY = "llm-playground:conversations:v2";

/** 보고 있던 대화 저장소 키. 새로고침하면 이 대화를 다시 연다 */
export const CURRENT_STORAGE_KEY = "llm-playground:current:v2";

/** 고른 화면 테마 저장소 키. index.html 의 인라인 스크립트도 같은 키를 읽는다 */
export const THEME_STORAGE_KEY = "llm-playground:theme";

/** 대화 보관 한도 (최신순). 대화 하나가 수 KB 라 localStorage 한도(약 5MB) 안에 넉넉하다 */
export const MAX_CONVERSATIONS = 200;

/**
 * 질문 최대 글자 수. 계약(AskRequest.question 의 maxLength)에서 생성한 값이다.
 * 브라우저 maxLength 는 UTF-16 단위라 이모지를 2자로 센다. 서버(Python len)보다 엄격한 쪽이라 길이 초과 422 를 받지 않는다
 */
export const MAX_QUESTION_LENGTH = ASK_REQUEST_QUESTION_MAX_LENGTH;
