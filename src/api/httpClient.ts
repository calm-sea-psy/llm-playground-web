// 실제 서버(llm-playground-wiki)에 요청하는 ApiClient. 응답 해석은 responses.ts, 이벤트 스트림 해석은 sse.ts 가 한다.

import { RequestError, type ApiClient } from "./client";
import type { paths } from "./generated/openapi";
import { readAskEvent, readAskRejection, readHealth, type HttpResult } from "./responses";
import { toAskBody } from "./schemas";
import { createSseParser, type SseMessage } from "./sse";
import type { AskEnd, AskProgress, AskRequest, HealthResponse } from "./types";

// 경로는 계약 생성 타입(paths)의 키로 적는다. 계약에서 경로가 바뀌면 이 자리에서 타입 오류가 난다
const PATH_HEALTH: keyof paths = "/health";
const PATH_ASK: keyof paths = "/ask";

/** /ask 응답의 형식 (계약 text/event-stream) */
const EVENT_STREAM_TYPE = "text/event-stream";

/** 실제 서버 클라이언트 설정 */
export interface HttpApiClientOptions {
  /** API 주소. 빈 문자열이면 같은 주소의 상대 경로(개발 중에는 Vite 프록시)로 보낸다 */
  baseUrl: string;
  /** /health 응답 대기 한도 (ms). 넘으면 network 오류 */
  readTimeoutMs: number;
  /** /ask 에서 서버가 아무것도 보내지 않고 이만큼(ms) 지나면 timeout 오류. 받을 때마다 다시 잰다 */
  streamIdleTimeoutMs: number;
}

/** 중지 신호 하나에 호출자의 중지와 대기 한도를 묶는다. AbortSignal.timeout · any 는 구형 브라우저(Safari 17.4 미만 등)에 없어 직접 묶는다 */
interface Deadline {
  signal: AbortSignal;
  /** 대기 한도를 처음부터 다시 잰다 */
  restart: () => void;
  /** 대기 한도에 걸려 끊었는지 */
  isExpired: () => boolean;
  /** 타이머와 구독을 정리한다 */
  dispose: () => void;
}

function deadline(timeoutMs: number, callerSignal: AbortSignal | undefined): Deadline {
  const controller = new AbortController();
  let isExpired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = (): void => controller.abort();
  function restart(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      isExpired = true;
      abort();
    }, timeoutMs);
  }
  restart();
  callerSignal?.addEventListener("abort", abort, { once: true });
  if (callerSignal?.aborted) {
    abort();
  }
  return {
    signal: controller.signal,
    restart,
    isExpired: () => isExpired,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
    },
  };
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined; // JSON 이 아니다 (빈 본문 · 프록시 오류 페이지). responses.ts 가 HTTP 상태로 판단한다
  }
}

/**
 * 끊긴 요청의 오류. 호출자가 중지했으면 aborted, 대기 한도면 timeout(읽기 요청은 network), 그 밖은 fallback
 *
 * @param timeoutCode 대기 한도에 걸렸을 때의 코드
 */
function cutError(
  e: unknown,
  callerSignal: AbortSignal | undefined,
  limit: Deadline,
  timeoutCode: "timeout" | "network",
  fallback: "network" | "interrupted",
): RequestError {
  if (e instanceof RequestError) {
    return e;
  }
  if (callerSignal?.aborted) {
    return new RequestError("aborted", "중지되었습니다", { cause: e });
  }
  if (limit.isExpired()) {
    return new RequestError(timeoutCode, "응답 대기 한도를 넘었습니다", { cause: e });
  }
  // 문구에 주소 · 질문을 넣지 않는다. 이 문구는 로그 서버에 남는다
  const message =
    fallback === "network" ? "서버에 연결하지 못했습니다" : "답을 받다가 연결이 끊겼습니다";
  return new RequestError(fallback, message, { cause: e });
}

/** 본문을 글로 읽는다. JSON 이 아니면 body 는 undefined */
async function readResult(res: Response): Promise<HttpResult> {
  return { status: res.status, body: parseJson(await res.text()) };
}

/**
 * 이벤트 스트림 본문을 끝 이벤트까지 읽는다. 진행 이벤트는 받을 때마다 onProgress 로 넘긴다.
 * 끝 이벤트를 받으면 남은 본문은 읽지 않고 닫는다.
 *
 * @throws RequestError data 가 계약과 다름(bad_response), 끝 이벤트 없이 스트림이 끝남(interrupted). 읽기 실패는 그대로 던진다
 */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  onChunk: () => void,
  onProgress: (event: AskProgress) => void,
): Promise<AskEnd> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  // 끝 이벤트면 돌려주고, 진행 이벤트는 넘긴다
  const handle = (messages: SseMessage[]): AskEnd | undefined => {
    for (const { event, data } of messages) {
      const result = readAskEvent(event, parseJson(data));
      if (result.kind === "end") {
        return result.end;
      }
      if (result.kind === "progress") {
        onProgress(result.progress);
      }
    }
    return undefined;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const end = handle(parser.push(decoder.decode())) ?? handle(parser.end());
        if (end) {
          return end;
        }
        throw new RequestError("interrupted", "끝 이벤트(done · error) 없이 스트림이 끝났습니다");
      }
      onChunk();
      const end = handle(parser.push(decoder.decode(value, { stream: true })));
      if (end) {
        return end;
      }
    }
  } finally {
    // 끝 이벤트 뒤에 남은 본문 · 실패한 스트림은 더 읽지 않는다. 닫다가 난 오류는 결과와 상관없다
    reader.cancel().catch(() => undefined);
  }
}

/** llm-playground-wiki API(/health · /ask)에 붙는 클라이언트 */
export function createHttpApiClient({
  baseUrl,
  readTimeoutMs,
  streamIdleTimeoutMs,
}: HttpApiClientOptions): ApiClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    const limit = deadline(readTimeoutMs, signal);
    try {
      return readHealth(
        await readResult(await fetch(`${root}${PATH_HEALTH}`, { signal: limit.signal })),
      );
    } catch (e) {
      throw cutError(e, signal, limit, "network", "network");
    } finally {
      limit.dispose();
    }
  }

  async function ask(
    request: AskRequest,
    onProgress: (event: AskProgress) => void,
    signal?: AbortSignal,
  ): Promise<AskEnd> {
    const limit = deadline(streamIdleTimeoutMs, signal);
    const url = `${root}${PATH_ASK}?mode=${encodeURIComponent(request.mode)}`;
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: EVENT_STREAM_TYPE },
      body: JSON.stringify(toAskBody(request)),
      signal: limit.signal,
    };
    try {
      let res: Response;
      try {
        res = await fetch(url, init);
        if (!res.ok) {
          throw readAskRejection(await readResult(res));
        }
      } catch (e) {
        throw cutError(e, signal, limit, "timeout", "network");
      }
      const type = res.headers.get("Content-Type") ?? "";
      if (!type.startsWith(EVENT_STREAM_TYPE) || res.body === null) {
        throw new RequestError(
          "bad_response",
          `답변 응답이 이벤트 스트림이 아닙니다 (${type || "형식 없음"})`,
        );
      }
      try {
        return await readEvents(res.body, limit.restart, onProgress);
      } catch (e) {
        throw cutError(e, signal, limit, "timeout", "interrupted");
      }
    } finally {
      limit.dispose();
    }
  }

  return { getHealth, ask };
}
