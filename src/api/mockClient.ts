// 서버 없이 화면을 돌려 보는 목업 클라이언트. 실제 서버와 같은 순서로 이벤트를 흘린다:
// status(classifying) → classification → status(answering | adventure) → delta … → done
//
// 문의 내용으로 흐름을 고른다.
// - "배송" · "환불" · "반품" · "계정" · "로그인" → 해당 라벨로 분류하고 답변을 조각으로 흘린다
// - 그 밖 → 범위 밖(adventure): delta 없이 기다렸다가 done 에 전체 답변 (툴 호출 기록 포함)
// - "오류" 가 들어 있으면 done(status="error", llm_error)

import { AnswerStreamError, type ApiClient, type AnswerStreamHandlers } from "./client";
import type {
  AnswerRequest,
  AnswerResponse,
  Health,
  Label,
  Provider,
  RoutingResult,
  ToolCall,
} from "./types";

/** 목업 응답 속도 */
export interface MockApiClientOptions {
  /** 단계 사이 대기 (분류 · 답변 시작) */
  stepMs: number;
  /** 답변 조각 사이 대기 */
  deltaMs: number;
  /** 범위 밖 문의의 답변 대기 */
  adventureMs: number;
}

const DEFAULT_OPTIONS: MockApiClientOptions = { stepMs: 500, deltaMs: 40, adventureMs: 3000 };

const MODEL_BY_PROVIDER: Record<Provider, string> = {
  local: "mock/gemma-3-4b",
  openai: "mock/gpt-4.1-mini",
};

const KEYWORDS: Array<[Label, RegExp]> = [
  ["shipping", /배송|택배|도착/],
  ["refund", /환불|반품|취소/],
  ["account", /계정|로그인|비밀번호|회원/],
];

const ANSWERS: Record<Exclude<Label, "unknown">, string> = {
  shipping: [
    "불편을 드려 죄송합니다. 배송 상황을 확인해 보겠습니다.",
    "",
    "**확인 방법**",
    "1. 마이페이지 → 주문 내역에서 송장 번호를 확인해 주세요.",
    "2. 택배사 조회 화면에서 현재 위치를 볼 수 있습니다.",
    "",
    "주문 후 **7일**이 지나도 출고되지 않았다면 상담원이 판매자에게 직접 확인해 드리겠습니다.",
  ].join("\n"),
  refund: [
    "환불은 반품 상품이 도착해 검수가 끝난 뒤 진행됩니다.",
    "",
    "| 결제 수단 | 환불 기간 |",
    "| --- | --- |",
    "| 신용카드 | 영업일 기준 3~5일 |",
    "| 계좌이체 | 영업일 기준 1~2일 |",
    "",
    "진행 상황은 `마이페이지 > 취소/반품` 에서 확인할 수 있습니다.",
  ].join("\n"),
  account: [
    "로그인이 되지 않으면 아래 순서로 확인해 주세요.",
    "",
    "- 비밀번호 찾기로 새 비밀번호를 설정합니다.",
    "- 5회 이상 틀리면 **30분** 동안 로그인이 잠깁니다.",
    "- 휴면 계정이면 본인 인증 후 다시 쓸 수 있습니다.",
  ].join("\n"),
};

const ADVENTURE_ANSWER =
  "상담 범위 밖의 질문이라 도구를 써서 찾아봤습니다. 오늘 서울은 맑고 낮 기온은 **18도** 안팎입니다.";

const ADVENTURE_TOOLS: ToolCall[] = [
  { name: "get_today", args: {}, ok: true, error: null, latencyMs: 3 },
  { name: "get_weather", args: { city: "서울" }, ok: true, error: null, latencyMs: 420 },
];

/** 목업 서버 상태 */
const MOCK_HEALTH: Health = {
  classifier: "mock-classifier",
  classifierDevice: "cpu",
  classifierError: null,
  routeRuleEnabled: true,
  verifyMode: "uncertain",
  defaultProvider: "local",
};

/** 서버 없이 정해진 시나리오로 답하는 클라이언트 */
export function createMockApiClient(options: Partial<MockApiClientOptions> = {}): ApiClient {
  const { stepMs, deltaMs, adventureMs } = { ...DEFAULT_OPTIONS, ...options };

  async function getHealth(signal?: AbortSignal): Promise<Health> {
    await wait(0, signal);
    return MOCK_HEALTH;
  }

  async function answerStream(
    request: AnswerRequest,
    handlers: AnswerStreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<AnswerResponse> {
    const startedAt = Date.now();
    const provider = request.provider ?? MOCK_HEALTH.defaultProvider;
    const label = request.label ?? classify(request.text);

    let classification: RoutingResult | null = null;
    if (!request.label) {
      handlers.onStatus?.({ stage: "classifying", message: "" });
      await wait(stepMs, signal);
      classification = routingResult(label, request.text);
      handlers.onClassification?.(classification);
    }

    const base = {
      requestId: `mock-${crypto.randomUUID()}`,
      label,
      provider,
      model: MODEL_BY_PROVIDER[provider],
      promptVersion: "mock-v1",
      usage: { inputTokens: 120, outputTokens: 80 },
      createdAt: new Date().toISOString(),
      classification,
    };

    if (label === "unknown") {
      handlers.onStatus?.({ stage: "adventure", message: "" });
      await wait(adventureMs, signal);
      return {
        ...base,
        status: "ok",
        answer: ADVENTURE_ANSWER,
        toolsUsed: ADVENTURE_TOOLS,
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    }

    handlers.onStatus?.({ stage: "answering", message: "" });
    await wait(stepMs, signal);

    if (request.text.includes("오류")) {
      return {
        ...base,
        status: "error",
        answer: null,
        toolsUsed: [],
        latencyMs: Date.now() - startedAt,
        error: { code: "llm_error", message: "목업: 모델 서버에 연결할 수 없습니다" },
      };
    }

    const answer = ANSWERS[label];
    for (const piece of splitPieces(answer)) {
      handlers.onDelta?.(piece);
      await wait(deltaMs, signal);
    }
    return {
      ...base,
      status: "ok",
      answer,
      toolsUsed: [],
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  }

  return { getHealth, answerStream };
}

function classify(text: string): Label {
  return KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
}

function routingResult(label: Label, text: string): RoutingResult {
  const known = label !== "unknown";
  const scores: Record<string, number> = { shipping: 0.1, refund: 0.1, account: 0.1 };
  if (known) {
    scores[label] = 0.8;
  }
  return {
    label,
    text,
    classifierLabel: known ? label : "shipping",
    scores,
    route: known
      ? { route: "confident", p1: 0.8, margin: 0.7, reason: "" }
      : { route: "unknown", p1: 0.1, margin: 0, reason: "모든 라벨의 확률이 낮음" },
    verification: null,
  };
}

/** 실제 스트림처럼 2~6글자씩 자른다 (코드 포인트 단위) */
function splitPieces(text: string): string[] {
  const chars = Array.from(text);
  const pieces: string[] = [];
  for (let i = 0; i < chars.length;) {
    const size = 2 + (i % 5);
    pieces.push(chars.slice(i, i + size).join(""));
    i += size;
  }
  return pieces;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AnswerStreamError("aborted", "중지되었습니다"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });

    function abort(): void {
      clearTimeout(timer);
      reject(new AnswerStreamError("aborted", "중지되었습니다"));
    }
  });
}
