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

/** RAG Q&A API 서버(/health · /query)에 붙는 클라이언트 */
export function createHttpApiClient({ baseUrl, healthTimeoutMs }: HttpApiClientOptions): ApiClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const timeout = AbortSignal.timeout(healthTimeoutMs);
    const res = await fetch(`${root}/health`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const parsed = healthSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error("상태 응답 형식이 맞지 않습니다", { cause: parsed.error });
    }
    return parsed.data;
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
    let body: unknown;
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
    try {
      body = await res.json();
    } catch (e) {
      if (signal?.aborted) {
        throw fail(e, "중지되었습니다");
      }
      body = undefined; // 본문이 JSON 이 아니다 (프록시 오류 페이지 등). 아래에서 상태 코드로 판단한다
    }

    const parsed = queryResponseSchema.safeParse(body);
    if (parsed.success) {
      return parsed.data; // 200, 또는 status=error 응답(error_code 별 503 · 502 · 504 · 500)
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
    // 서버가 JSON 으로 답했지만 계약 모양이 아니다 (불변식 위반 포함). 상태 코드와 상관없이 형식 오류
    throw new QueryError("bad_response", `응답 형식이 맞지 않습니다 (HTTP ${res.status})`, {
      cause: parsed.error,
    });
  }

  return { getHealth, createSession, query };
}

/** 422 본문(FastAPI detail)에서 처음 틀린 필드로 코드를 고른다 */
function invalidCodeOf(body: unknown): QueryErrorCode {
  const parsed = validationErrorSchema.safeParse(body);
  const field = parsed.success ? parsed.data.detail[0]?.loc.at(-1) : undefined;
  const isKnownField = typeof field === "string" && Object.hasOwn(INVALID_FIELD_CODES, field);
  return (isKnownField && INVALID_FIELD_CODES[field]) || "invalid_request";
}
