// 서버 없이 화면을 돌려 보는 목업 클라이언트. 질문 내용으로 응답 상태를 고른다.
// - "오류" → status="error" (error_code=model_timeout)
// - "422" → 422 거절 (invalid_question)
// - "범위 밖" · "자료에 없는" → abstained (근거 자료 없음)
// - "이번 건" · "몇 시" → needs_clarification (대상이 특정되지 않음)
// - 그 밖 → answered
// 세션마다 몇 번째 질문인지 세어 답 끝에 적는다 (같은 대화가 같은 세션 id 를 보내는지 확인용).
// 같은 검색 방식으로 같은 질문을 다시 하면 cache_hit 으로 답한다 (서버 Redis 캐시 흉내).
// 답 내용은 화면 확인용 예시일 뿐 실제 자료가 아니다.

import { QueryError, type ApiClient } from "./client";
import {
  RETRIEVAL_MODES,
  type AnswerStatus,
  type Citation,
  type HealthResponse,
  type QueryRequest,
  type QueryResponse,
  type RetrievalMode,
} from "./types";
import { randomUuid } from "../lib/uuid";

/** 목업 응답 속도 */
export interface MockApiClientOptions {
  /** 검색 방식별 응답 대기 (ms). 리랭킹이 가장 느린 실제 서버를 흉내 낸다 */
  delayMs: Record<RetrievalMode, number>;
}

/** 목업 한 상태의 답 */
interface MockAnswer {
  answer: string;
  reason: string;
  citations: Citation[];
}

const DEFAULT_OPTIONS: MockApiClientOptions = {
  delayMs: { naive: 600, hybrid: 900, hybrid_rerank: 1500 },
};

/** 캐시 적중이면 이만큼만 기다린다 */
const CACHE_HIT_DELAY_MS = 100;

const HEALTH: HealthResponse = {
  status: "ok",
  indexReady: true,
  indexName: "mock-index",
  embedderId: "mock-embedder",
  supportedModes: [...RETRIEVAL_MODES],
};

const ANSWERS: Record<Exclude<AnswerStatus, "error">, MockAnswer> = {
  answered: {
    answer: "**[목업] 결론**: 질문에 맞는 답이 여기에 표시됩니다.",
    reason: "검색한 문서에서 질문과 맞는 부분을 고르고, 나중에 바뀐 공지가 있는지 확인했습니다.",
    // 같은 문서 · 쪽이 두 번 → 화면은 한 번만 보여야 한다
    citations: [
      citation("S1", "manual", 9),
      citation("S2", "notice", 3),
      citation("S3", "manual", 9),
    ],
  },
  needs_clarification: {
    answer: "어느 건(대상)과 어느 날짜 기준을 말씀하시는지 알려 주세요.",
    reason: "마감 시각은 대상과 기준일에 따라 달라집니다.",
    citations: [citation("S1", "guide", 2)],
  },
  abstained: {
    answer: "확보한 자료 범위 밖이라 답을 확정할 수 없습니다.",
    reason:
      "질문과 맞는 근거를 자료에서 찾지 못했습니다. 관련 문서를 추가하면 다시 확인할 수 있습니다.",
    citations: [citation("S1", "policy", 1)],
  },
};

/** 목업 API 클라이언트. 옵션은 테스트에서 대기를 0 으로 줄일 때 쓴다 */
export function createMockApiClient(options: Partial<MockApiClientOptions> = {}): ApiClient {
  const { delayMs } = { ...DEFAULT_OPTIONS, ...options };
  /** 세션 id → 지금까지 답한 질문 수 */
  const turns = new Map<string, number>();
  /** 이미 답한 "검색 방식:질문" */
  const answered = new Set<string>();

  function getHealth(): Promise<HealthResponse> {
    return Promise.resolve(HEALTH);
  }

  function createSession(): Promise<string> {
    return Promise.resolve(randomUuid());
  }

  async function query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse> {
    const cacheKey = `${request.retrievalMode}:${request.question}`;
    const cacheHit = answered.has(cacheKey);
    const delay = cacheHit
      ? Math.min(CACHE_HIT_DELAY_MS, delayMs[request.retrievalMode])
      : delayMs[request.retrievalMode];
    await wait(delay, signal);
    if (request.question.includes("422")) {
      throw new QueryError("invalid_question", "요청이 검증에서 거절되었습니다 (HTTP 422)");
    }
    const turn = (turns.get(request.sessionId) ?? 0) + 1;
    turns.set(request.sessionId, turn);

    const status = statusOf(request.question);
    const requestId = `mock-${randomUuid().slice(0, 8)}`;
    if (status === "error") {
      // 계약 예시(query_error)와 같은 모양
      return {
        requestId,
        status,
        answer: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        reason: "model_timeout",
        citations: [],
        errorCode: "model_timeout",
        meta: meta(request.retrievalMode, delay, null, false),
      };
    }
    answered.add(cacheKey);
    const { answer, reason, citations } = ANSWERS[status];
    return {
      requestId,
      status,
      answer: `${answer}\n\n_(목업 · 이 대화의 ${turn}번째 질문)_`,
      reason,
      citations,
      errorCode: null,
      meta: meta(request.retrievalMode, delay, turn, cacheHit),
    };
  }

  return { getHealth, createSession, query };
}

function statusOf(question: string): AnswerStatus {
  if (question.includes("오류")) {
    return "error";
  }
  if (/범위 밖|자료에 없는/.test(question)) {
    return "abstained";
  }
  if (/이번 건|몇 시/.test(question)) {
    return "needs_clarification";
  }
  return "answered";
}

/** 응답 meta. turn 이 없으면(오류) 토큰도 없다 */
function meta(
  retrievalMode: RetrievalMode,
  latencyMs: number,
  turn: number | null,
  cacheHit: boolean,
): QueryResponse["meta"] {
  return {
    retrievalMode,
    latencyMs,
    inputTokens: turn === null ? null : 1000 + turn * 200,
    outputTokens: turn === null ? null : 180,
    cacheHit,
    traceId: null,
  };
}

function citation(sourceId: string, bookId: string, page: number): Citation {
  return { sourceId, bookId, fileName: `${bookId}.pdf`, page };
}

/** ms 만큼 기다린다. 그사이 중지되면 aborted 로 거절한다 */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = (): QueryError => new QueryError("aborted", "중지되었습니다");
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    function handleAbort(): void {
      clearTimeout(timer);
      reject(aborted());
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
