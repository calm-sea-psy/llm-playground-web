// 설정값은 이 파일 한 곳에 모은다.

import type { RetrievalMode } from "../api/types";

/** API 연결 방식. "http" 면 실제 서버, 그 밖(기본)은 서버 없이 도는 목업 */
export const API_MODE: "mock" | "http" = import.meta.env.VITE_API_MODE === "http" ? "http" : "mock";

/** API 주소 (http 모드). 비우면 같은 주소의 상대 경로(개발 중에는 Vite 프록시)로 보낸다 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** 하루 (ms). 질문 내역을 날짜로 묶을 때 쓴다 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** /health 확인 주기 */
export const HEALTH_INTERVAL_MS = 30_000;

/** /health 응답 대기 한도 (넘으면 연결 안 됨으로 본다) */
export const HEALTH_TIMEOUT_MS = 5_000;

/** /query 응답 대기 한도. nginx 의 proxy_read_timeout(120초)이 먼저 504 를 주도록 조금 길게 둔다 */
export const QUERY_TIMEOUT_MS = 130_000;

/**
 * 질문 최대 글자 수. 서버 검증 한도가 정해지면 맞춘다 (넘으면 422).
 * 서버는 Python len 기준이라 코드 포인트로 센다
 */
export const MAX_INPUT_LENGTH = 2000;

/** 처음 고른 검색 방식. 서비스 기본으로 쓸 방식 */
export const DEFAULT_RETRIEVAL_MODE: RetrievalMode = "hybrid_rerank";

/** 입력창 최대 높이 (넘으면 입력창 안에서 스크롤) */
export const COMPOSER_MAX_HEIGHT_PX = 200;

/** 바닥에서 이 거리 이내면 바닥에 붙은 것으로 본다 (자동 스크롤 켜짐) */
export const AUTO_SCROLL_THRESHOLD_PX = 80;
