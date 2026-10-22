import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import { AnswerStreamError, type AnswerStreamHandlers } from "./client";
import { createHttpApiClient } from "./httpClient";
import { answerResponseSchema, type routingResultSchema } from "./schemas";

/** 서버가 보내는 형식 (snake_case) */
type WireAnswer = z.input<typeof answerResponseSchema>;
type WireRouting = z.input<typeof routingResultSchema>;

const client = createHttpApiClient({ baseUrl: "", healthTimeoutMs: 5000 });
const answerStream = client.answerStream;

const encoder = new TextEncoder();

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function answer(overrides: Partial<WireAnswer> = {}): WireAnswer {
  return {
    request_id: "req-1",
    status: "ok",
    label: "shipping",
    answer: "배송 지연은 확인 후 안내드리겠습니다.",
    provider: "local",
    model: "gemma",
    prompt_version: "v1",
    tools_used: [],
    latency_ms: 1600,
    usage: { input_tokens: 10, output_tokens: 20 },
    error: null,
    created_at: "2026-10-13T00:00:00Z",
    classification: null,
    ...overrides,
  };
}

const CLASSIFICATION: WireRouting = {
  label: "shipping",
  text: "배송이 늦어요",
  classifier_label: "shipping",
  scores: { shipping: 0.9, refund: 0.05, account: 0.05 },
  route: { route: "confident", p1: 0.9, margin: 0.85, reason: "" },
  verification: null,
};

/** 조각을 차례로 흘리는 SSE 응답. hang이면 끝나지 않고 signal이 중지될 때까지 기다린다 (fetch의 중지 동작 흉내). */
function streamResponse(
  chunks: string[],
  { hang = false, signal }: { hang?: boolean; signal?: AbortSignal } = {},
) {
  const queue = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next !== undefined) return void controller.enqueue(encoder.encode(next));
      if (!hang) return void controller.close();
      return new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => {
          controller.error(new DOMException("This operation was aborted", "AbortError"));
          resolve();
        });
      });
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function mockFetch(impl: (init: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn((_url: string, init: RequestInit) => Promise.resolve(impl(init)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function recorder() {
  const events: Array<[string, unknown]> = [];
  const handlers: AnswerStreamHandlers = {
    onStatus: (e) => events.push(["status", e.stage]),
    onClassification: (r) => events.push(["classification", r.label]),
    onDelta: (t) => events.push(["delta", t]),
  };
  return { events, handlers };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("answerStream", () => {
  it("정상 흐름: status → classification → status → delta 여러 개 → done", async () => {
    const done = answer({ classification: CLASSIFICATION });
    const fetch = mockFetch(() =>
      streamResponse([
        sse("status", { stage: "classifying", message: "문의를 분류하는 중..." }),
        sse("classification", CLASSIFICATION),
        sse("status", { stage: "answering", message: "답변을 작성하는 중..." }),
        sse("delta", { text: "배송 지연은" }),
        sse("delta", { text: " 확인 후" }),
        sse("done", done),
      ]),
    );
    const { events, handlers } = recorder();

    await expect(
      answerStream({ text: "배송이 늦어요", provider: "local" }, handlers),
    ).resolves.toEqual(answerResponseSchema.parse(done));
    expect(events).toEqual([
      ["status", "classifying"],
      ["classification", "shipping"],
      ["status", "answering"],
      ["delta", "배송 지연은"],
      ["delta", " 확인 후"],
    ]);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/answer/stream");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "배송이 늦어요", provider: "local" });
  });

  it("adventure 흐름: delta 없이 done에 전체 답변", async () => {
    const done = answer({ label: "unknown", answer: "오늘은 화요일입니다." });
    mockFetch(() =>
      streamResponse([
        sse("status", {
          stage: "adventure",
          message: "챗봇이 알 수 없는 것을 찾아 모험을 떠나는 중...",
        }),
        sse("done", done),
      ]),
    );
    const { events, handlers } = recorder();

    await expect(answerStream({ text: "오늘 무슨 요일이에요?" }, handlers)).resolves.toEqual(
      answerResponseSchema.parse(done),
    );
    expect(events).toEqual([["status", "adventure"]]);
  });

  it("이벤트가 조각 경계에서 잘려 와도 처리한다", async () => {
    const whole = sse("delta", { text: "한글 조각" }) + sse("done", answer());
    const bytes = encoder.encode(whole);
    // 한글 바이트 중간을 지나도록 3바이트씩 흘린다
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(body))),
    );
    const deltas: string[] = [];

    await expect(
      answerStream({ text: "x" }, { onDelta: (t) => deltas.push(t) }),
    ).resolves.toMatchObject({ status: "ok" });
    expect(deltas.join("")).toBe("한글 조각");
  });

  it('done(status="error")는 예외가 아니라 응답으로 돌려준다', async () => {
    const done = answer({
      status: "error",
      answer: null,
      error: { code: "llm_error", message: "Ollama에 연결할 수 없습니다" },
    });
    mockFetch(() =>
      streamResponse([sse("status", { stage: "answering", message: "" }), sse("done", done)]),
    );

    await expect(answerStream({ text: "x" })).resolves.toEqual(answerResponseSchema.parse(done));
  });

  it("HTTP 400(입력 오류)은 JSON AnswerResponse로 돌려준다", async () => {
    const body = answer({
      status: "error",
      answer: null,
      error: { code: "invalid_input", message: "text: 빈 문장" },
    });
    mockFetch(() => Response.json(body, { status: 400 }));

    await expect(answerStream({ text: "" })).resolves.toEqual(answerResponseSchema.parse(body));
  });

  it("HTTP 502(백엔드 꺼짐, 빈 본문)는 network 오류", async () => {
    mockFetch(() => new Response("", { status: 502 }));

    await expect(answerStream({ text: "x" })).rejects.toMatchObject({ code: "network" });
  });

  it("fetch 자체가 실패하면 network 오류", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(answerStream({ text: "x" })).rejects.toMatchObject({
      name: "AnswerStreamError",
      code: "network",
      message: "API 서버에 연결할 수 없습니다",
    });
  });

  it("done 없이 스트림이 끝나면 incomplete 오류", async () => {
    mockFetch(() => streamResponse([sse("delta", { text: "중간까지" })]));
    const deltas: string[] = [];

    await expect(
      answerStream({ text: "x" }, { onDelta: (t) => deltas.push(t) }),
    ).rejects.toMatchObject({
      code: "incomplete",
    });
    expect(deltas).toEqual(["중간까지"]);
  });

  it("data가 JSON이 아니면 bad_response 오류", async () => {
    mockFetch(() => streamResponse(["event: delta\ndata: {깨짐\n\n"]));

    await expect(answerStream({ text: "x" })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("모르는 이벤트는 무시한다", async () => {
    mockFetch(() => streamResponse([sse("ping", {}), sse("done", answer())]));

    await expect(answerStream({ text: "x" })).resolves.toMatchObject({ status: "ok" });
  });

  it("스트리밍 중 중지하면 aborted 오류이고, 받은 delta는 이미 전달되어 있다", async () => {
    const controller = new AbortController();
    mockFetch((init) =>
      streamResponse([sse("delta", { text: "받은 데까지" })], {
        hang: true,
        signal: init.signal ?? undefined,
      }),
    );
    const deltas: string[] = [];
    const promise = answerStream(
      { text: "x" },
      {
        onDelta: (t) => {
          deltas.push(t);
          controller.abort();
        },
      },
      controller.signal,
    );

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnswerStreamError);
    expect(error).toMatchObject({ code: "aborted" });
    expect(deltas).toEqual(["받은 데까지"]);
  });

  it("응답 전에 중지하면 aborted 오류 (network와 구분)", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const promise = answerStream({ text: "x" }, {}, controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("응답 변환", () => {
  it("서버 형식(snake_case)을 화면 형식(camelCase)으로 바꾼다", async () => {
    mockFetch(() =>
      streamResponse([
        sse(
          "done",
          answer({
            classification: CLASSIFICATION,
            tools_used: [
              { name: "get_weather", args: { city: "서울" }, ok: true, latency_ms: 300 },
            ],
          }),
        ),
      ]),
    );

    const res = await answerStream({ text: "x" });
    expect(res).toMatchObject({
      requestId: "req-1",
      promptVersion: "v1",
      latencyMs: 1600,
      usage: { inputTokens: 10, outputTokens: 20 },
      createdAt: "2026-10-13T00:00:00Z",
      toolsUsed: [{ name: "get_weather", ok: true, error: null, latencyMs: 300 }],
      classification: { classifierLabel: "shipping", route: { route: "confident" } },
    });
  });

  it("done 의 필드가 빠졌으면 bad_response 오류", async () => {
    const { model: _model, ...broken } = answer();
    mockFetch(() => streamResponse([sse("done", broken)]));

    await expect(answerStream({ text: "x" })).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("getHealth", () => {
  it("상태를 화면 형식으로 돌려준다", async () => {
    mockFetch(() =>
      Response.json({
        status: "ok",
        classifier: "klue-roberta",
        classifier_device: "cuda",
        classifier_error: null,
        route_rule_enabled: true,
        verify_mode: "uncertain",
        default_provider: "openai",
      }),
    );

    await expect(client.getHealth()).resolves.toEqual({
      classifier: "klue-roberta",
      classifierDevice: "cuda",
      classifierError: null,
      routeRuleEnabled: true,
      verifyMode: "uncertain",
      defaultProvider: "openai",
    });
  });

  it("형식이 맞지 않으면 예외", async () => {
    mockFetch(() => Response.json({ status: "ok" }));

    await expect(client.getHealth()).rejects.toThrow("상태 응답 형식이 맞지 않습니다");
  });
});
