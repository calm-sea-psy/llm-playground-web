// 서버 없이 화면을 돌려 보는 목업 클라이언트. wiki 계약 예시(contracts/examples/ask_*.json)의 이벤트 열을 시간 간격을 두고 재생한다.
// 예시는 wiki 목업 서버(RAG_IMPL=mock)가 같은 질문에 보내는 이벤트 열과 같아, 질문 꼬리표도 wiki 목업과 같은 길을 고른다:
// - 꼬리표 없음 → grounded (출처 번호 붙은 답)
// - "#거절" → refuse 고정 문구 · "#못찾음" → grounded → partial (에이전트면 에이전트)
// - "#일반" → 에이전트면 에이전트 partial 구간 (단발 partial 예시는 없어 단발이면 grounded)
// - "#생성오류" → error(generation)
// - "안녕하세요" → 질문 관문 고정 답
// 이벤트는 실제 서버와 같은 해석(responses.ts 의 readAskEvent)을 거친다. 예시가 계약과 다르면 bad_response 로 드러난다.

import { RequestError, type ApiClient } from "./client";
import { readAskEvent, readHealth } from "./responses";
import {
  ASK_MODE_DEFAULT,
  type AskEnd,
  type AskMode,
  type AskProgress,
  type AskRequest,
  type HealthResponse,
} from "./types";
import askAgentNotFound from "../../contracts/examples/ask_agent_not_found.json";
import askAgentPartial from "../../contracts/examples/ask_agent_partial.json";
import askError from "../../contracts/examples/ask_error.json";
import askGate from "../../contracts/examples/ask_gate.json";
import askGrounded from "../../contracts/examples/ask_grounded.json";
import askGroundedToPartial from "../../contracts/examples/ask_grounded_to_partial.json";
import askRefuse from "../../contracts/examples/ask_refuse.json";
import health from "../../contracts/examples/health.json";

/** 질문 꼬리표 (wiki 목업과 같은 꼴: # 뒤 한글 · 영문) */
const TAG_PATTERN = /#[\p{L}\p{N}_]+/u;

/** 꼬리표도 질문도 맞는 예시가 없을 때 */
const FALLBACK_EXAMPLE = askGrounded;

/** 단발 방식 (계약 mode 의 기본값) */
const SINGLE_MODE: AskMode = ASK_MODE_DEFAULT;

/** 계약 예시 하나: 요청과 서버가 보내는 이벤트 열 */
interface AskExample {
  request: { question: string; mode: string };
  events: Array<{ event: string; data: unknown }>;
}

/** 이벤트 사이 간격 (ms) */
export interface MockApiClientOptions {
  /** 단계 · 출처 이벤트 앞 */
  stepDelayMs: number;
  /** 답 조각 앞. wiki 목업 서버는 단어마다 0.03초 */
  deltaDelayMs: number;
}

const DEFAULT_OPTIONS: MockApiClientOptions = { stepDelayMs: 500, deltaDelayMs: 120 };

const EXAMPLES: readonly AskExample[] = [
  askGrounded,
  askGate,
  askRefuse,
  askGroundedToPartial,
  askError,
  askAgentPartial,
  askAgentNotFound,
];

function tagOf(question: string): string | undefined {
  return TAG_PATTERN.exec(question)?.[0];
}

/**
 * 후보 중 방식이 같은 예시, 없으면 단발 예시. 에이전트 요청은 단발로 끝날 수 있지만(wiki 의 관문 · refuse · grounded 찾음)
 * 단발 요청이 에이전트 단계를 거치는 일은 없어, 단발 요청에 에이전트 예시를 고르지 않는다
 */
function pick(candidates: AskExample[], mode: AskMode): AskExample | undefined {
  return (
    candidates.find((e) => e.request.mode === mode) ??
    candidates.find((e) => e.request.mode === SINGLE_MODE)
  );
}

/** 질문이 같은 예시 → 꼬리표가 같은 예시 → grounded */
function exampleFor({ question, mode }: AskRequest): AskExample {
  const text = question.trim();
  const tag = tagOf(text);
  const tagged = tag === undefined ? [] : EXAMPLES.filter((e) => tagOf(e.request.question) === tag);
  const sameQuestion = EXAMPLES.filter((e) => e.request.question === text);
  return pick(sameQuestion, mode) ?? pick(tagged, mode) ?? FALLBACK_EXAMPLE;
}

/** ms 만큼 기다린다. 그사이 중지되면 aborted 로 거절한다 */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = (): RequestError => new RequestError("aborted", "중지되었습니다");
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

/** 목업 API 클라이언트. 옵션은 테스트에서 간격을 0 으로 줄일 때 쓴다 */
export function createMockApiClient(options: Partial<MockApiClientOptions> = {}): ApiClient {
  const { stepDelayMs, deltaDelayMs } = { ...DEFAULT_OPTIONS, ...options };

  function getHealth(): Promise<HealthResponse> {
    return Promise.resolve(readHealth({ status: 200, body: health }));
  }

  async function ask(
    request: AskRequest,
    onProgress: (event: AskProgress) => void,
    signal?: AbortSignal,
  ): Promise<AskEnd> {
    for (const { event, data } of exampleFor(request).events) {
      await wait(event === "delta" ? deltaDelayMs : stepDelayMs, signal);
      const result = readAskEvent(event, data);
      if (result.kind === "end") {
        return result.end;
      }
      if (result.kind === "progress") {
        onProgress(result.progress);
      }
    }
    throw new RequestError("interrupted", "예시에 끝 이벤트(done · error)가 없습니다");
  }

  return { getHealth, ask };
}
