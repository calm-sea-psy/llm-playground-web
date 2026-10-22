import { describe, expect, it } from "vitest";

import { AnswerStreamError } from "./client";
import { createMockApiClient } from "./mockClient";

const client = createMockApiClient({ stepMs: 0, deltaMs: 0, adventureMs: 0 });

function recorder() {
  const events: string[] = [];
  let text = "";
  return {
    events,
    get text() {
      return text;
    },
    handlers: {
      onStatus: (e: { stage: string }) => events.push(`status:${e.stage}`),
      onClassification: (r: { label: string }) => events.push(`classification:${r.label}`),
      onDelta: (t: string) => {
        text += t;
      },
    },
  };
}

describe("createMockApiClient", () => {
  it("상태는 항상 정상", async () => {
    await expect(client.getHealth()).resolves.toMatchObject({ classifierError: null });
  });

  it("배송 문의: 분류 → 답변 조각 → done, 조각을 이으면 done 의 답변과 같다", async () => {
    const r = recorder();
    const res = await client.answerStream(
      { text: "배송이 늦어요", provider: "openai" },
      r.handlers,
    );

    expect(r.events).toEqual(["status:classifying", "classification:shipping", "status:answering"]);
    expect(res).toMatchObject({ status: "ok", label: "shipping", provider: "openai" });
    expect(r.text).toBe(res.answer);
  });

  it("범위 밖 문의: delta 없이 done 에 답변과 툴 기록", async () => {
    const r = recorder();
    const res = await client.answerStream({ text: "오늘 날씨 어때요?" }, r.handlers);

    expect(r.events).toEqual(["status:classifying", "classification:unknown", "status:adventure"]);
    expect(r.text).toBe("");
    expect(res.toolsUsed.length).toBeGreaterThan(0);
  });

  it('"오류" 가 들어 있으면 done(status="error")', async () => {
    const res = await client.answerStream({ text: "환불 오류 테스트" });
    expect(res).toMatchObject({ status: "error", answer: null, error: { code: "llm_error" } });
  });

  it("중지하면 aborted 오류", async () => {
    const slow = createMockApiClient({ stepMs: 1000 });
    const controller = new AbortController();
    const promise = slow.answerStream({ text: "배송" }, {}, controller.signal);
    controller.abort();

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnswerStreamError);
    expect(error).toMatchObject({ code: "aborted" });
  });
});
