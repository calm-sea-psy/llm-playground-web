import type { z } from "zod";

import { AnswerStreamError, type ApiClient, type AnswerStreamHandlers } from "./client";
import {
  answerResponseSchema,
  deltaEventSchema,
  healthSchema,
  routingResultSchema,
  statusEventSchema,
} from "./schemas";
import { SseParser, type SseMessage } from "./sse";
import type { AnswerRequest, AnswerResponse, Health } from "./types";

/** 실제 서버 클라이언트 설정 */
export interface HttpApiClientOptions {
  /** API 주소. 빈 문자열이면 같은 주소의 상대 경로(개발 중에는 Vite 프록시) */
  baseUrl: string;
  /** /health 응답 대기 한도 */
  healthTimeoutMs: number;
}

/** Seal_LLM API 서버에 붙는 클라이언트 */
export function createHttpApiClient({ baseUrl, healthTimeoutMs }: HttpApiClientOptions): ApiClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function getHealth(signal?: AbortSignal): Promise<Health> {
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

  async function answerStream(
    request: AnswerRequest,
    handlers: AnswerStreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<AnswerResponse> {
    const fail = (cause: unknown, message: string): AnswerStreamError =>
      signal?.aborted
        ? new AnswerStreamError("aborted", "중지되었습니다", { cause })
        : new AnswerStreamError("network", message, { cause });

    let res: Response;
    try {
      res = await fetch(`${root}/api/answer/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(request),
        signal,
      });
    } catch (e) {
      throw fail(e, "API 서버에 연결할 수 없습니다");
    }

    if (!res.ok) {
      // 입력 오류는 스트림을 열기 전에 HTTP 400 + AnswerResponse(JSON)로 온다
      const body: unknown = await res.json().catch(() => null);
      const parsed = answerResponseSchema.safeParse(body);
      if (parsed.success) {
        return parsed.data;
      }
      throw new AnswerStreamError("network", `API 서버에 연결할 수 없습니다 (HTTP ${res.status})`);
    }
    if (!res.body) {
      throw new AnswerStreamError("bad_response", "응답 본문이 없습니다");
    }

    const reader = res.body.getReader();
    const parser = new SseParser();
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (e) {
          throw fail(e, "API 서버와의 연결이 끊겼습니다");
        }
        const messages = chunk.done ? parser.end() : parser.push(chunk.value);
        for (const message of messages) {
          const done = dispatch(message, handlers);
          if (done) {
            return done;
          }
        }
        if (chunk.done) {
          throw new AnswerStreamError("incomplete", "답변을 끝까지 받지 못했습니다");
        }
      }
    } finally {
      // done 을 받은 뒤 · 오류로 빠져나올 때 연결을 정리한다 (이미 끝났으면 아무 일도 없다)
      reader.cancel().catch(ignore);
    }
  }

  return { getHealth, answerStream };
}

function ignore(): void {
  // 정리 중 오류는 무시한다
}

/** 이벤트 하나를 처리한다. done 이면 그 AnswerResponse 를 돌려준다. 모르는 이벤트는 무시한다 */
function dispatch(message: SseMessage, handlers: AnswerStreamHandlers): AnswerResponse | null {
  switch (message.event) {
    // 받는 쪽이 없어도 형식은 검사한다 (깨진 스트림을 조용히 넘기지 않게)
    case "status": {
      const event = parseEvent(statusEventSchema, message);
      handlers.onStatus?.(event);
      return null;
    }
    case "classification": {
      const result = parseEvent(routingResultSchema, message);
      handlers.onClassification?.(result);
      return null;
    }
    case "delta": {
      const { text } = parseEvent(deltaEventSchema, message);
      handlers.onDelta?.(text);
      return null;
    }
    case "done":
      return parseEvent(answerResponseSchema, message);
    default:
      return null;
  }
}

function parseEvent<T>(schema: z.ZodType<T>, message: SseMessage): T {
  let data: unknown;
  try {
    data = JSON.parse(message.data);
  } catch (e) {
    throw new AnswerStreamError("bad_response", `${message.event} 이벤트를 읽을 수 없습니다`, {
      cause: e,
    });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AnswerStreamError("bad_response", `${message.event} 이벤트 형식이 맞지 않습니다`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
