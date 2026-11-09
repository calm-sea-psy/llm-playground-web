import { QueryError, type ApiClient, type QueryErrorCode } from "./client";
import { healthSchema, queryResponseSchema, toQueryBody, validationErrorSchema } from "./schemas";
import type { HealthResponse, QueryRequest, QueryResponse } from "./types";
import { randomUuid } from "../lib/uuid";

/** 422 에서 틀린 필드 → 오류 코드 */
const INVALID_FIELD_CODES: Partial<Record<string, QueryErrorCode>> = {
  question: "invalid_question",
  retrieval_mode: "invalid_retrieval_mode",
};

/** 실제 서버 클라이언트 설정 */
export interface HttpApiClientOptions {
  /** API 주소. 빈 문자열이면 같은 주소의 상대 경로(개발 중에는 Vite 프록시) */
  baseUrl: string;
  /** /health 응답 대기 한도 */
  healthTimeoutMs: number;
}

/** 중지 신호에 시간 제한을 더한 신호 */
interface TimedSignal {
  signal: AbortSignal;
  /** 타이머와 구독을 정리한다. 요청이 끝나면 부른다 */
  dispose: () => void;
}

/** RAG Q&A API 서버(/health · /query)에 붙는 클라이언트 */
export function createHttpApiClient({ baseUrl, healthTimeoutMs }: HttpApiClientOptions): ApiClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const timed = withTimeout(signal, healthTimeoutMs);
    try {
      const res = await fetch(`${root}/health`, { signal: timed.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const parsed = healthSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new Error("상태 응답 형식이 맞지 않습니다", { cause: parsed.error });
      }
      return parsed.data;
    } finally {
      timed.dispose();
    }
  }

  // TODO: 서버 세션(/session · Redis)이 확정되면 POST /session 으로 받는다
  function createSession(): Promise<string> {
    return Promise.resolve(randomUuid());
  }

  async function query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse> {
    const fail = (cause: unknown, message: string): QueryError =>
      signal?.aborted
        ? new QueryError("aborted", "중지되었습니다", { cause })
        : new QueryError("network", message, { cause });

    let res: Response;
    try {
      res = await fetch(`${root}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toQueryBody(request)),
        signal,
      });
    } catch (e) {
      throw fail(e, "API 서버에 연결할 수 없습니다");
    }

    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      throw fail(e, "API 서버와의 연결이 끊겼습니다");
    }
    return toQueryResponse(res, parseJson(text));
  }

  return { getHealth, createSession, query };
}

/**
 * 받은 본문을 응답으로 바꾼다.
 *
 * @returns 200, 또는 status=error 응답(error_code 별 503 · 502 · 504 · 500)
 * @throws QueryError 422 · 본문 없는 HTTP 오류 · 계약에 맞지 않는 본문
 */
function toQueryResponse(res: Response, body: unknown): QueryResponse {
  const parsed = queryResponseSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  if (res.status === 422) {
    throw new QueryError(invalidCodeOf(body), "요청이 검증에서 거절되었습니다 (HTTP 422)", {
      cause: body,
    });
  }
  if (!res.ok && body === undefined) {
    // JSON 본문 없는 HTTP 오류 = 백엔드에 닿지 못함 (프록시 5xx 등)
    throw new QueryError("network", `API 서버에 연결할 수 없습니다 (HTTP ${res.status})`);
  }
  // 서버가 답했지만 계약 모양이 아니다 (불변식 위반 포함). 상태 코드와 상관없이 형식 오류
  throw new QueryError("bad_response", `응답 형식이 맞지 않습니다 (HTTP ${res.status})`, {
    cause: parsed.error,
  });
}

/** 본문이 JSON 이 아니면(프록시 오류 페이지 · 빈 본문 등) undefined */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 422 본문(FastAPI detail)에서 처음 틀린 필드로 코드를 고른다 */
function invalidCodeOf(body: unknown): QueryErrorCode {
  const parsed = validationErrorSchema.safeParse(body);
  const field = parsed.success ? parsed.data.detail[0]?.loc.at(-1) : undefined;
  const isKnownField = typeof field === "string" && Object.hasOwn(INVALID_FIELD_CODES, field);
  return (isKnownField && INVALID_FIELD_CODES[field]) || "invalid_request";
}

/**
 * 시간 제한을 더한 신호를 만든다.
 * AbortSignal.any 가 없는 브라우저(Safari 17.3 · Firefox 123 · Chrome 115 이하)에서도 돌도록 직접 잇는다.
 */
function withTimeout(outer: AbortSignal | undefined, timeoutMs: number): TimedSignal {
  const controller = new AbortController();
  const handleOuterAbort = (): void => controller.abort(outer?.reason);
  const timer = setTimeout(() => controller.abort(new Error("응답 시간 초과")), timeoutMs);

  if (outer?.aborted) {
    handleOuterAbort();
  } else {
    outer?.addEventListener("abort", handleOuterAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", handleOuterAbort);
    },
  };
}
