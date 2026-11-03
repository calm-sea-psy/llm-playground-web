// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MessageMeta } from "./MessageMeta";
import type { AnswerResponse, RoutingResult } from "../api/types";

afterEach(cleanup);

const CLASSIFICATION: RoutingResult = {
  label: "shipping",
  text: "오늘 날씨가 안좋아서 배송이 안되려나?",
  classifierLabel: "unknown",
  scores: { shipping: 0.41, unknown: 0.45, refund: 0.1, account: 0.04 },
  route: { route: "low_confidence", p1: 0.45, margin: 0.04, reason: "p1 < 0.6" },
  verification: {
    match: false,
    reason: "배송 지연 문의",
    finalLabel: "shipping",
    latencyMs: 820,
    error: null,
  },
};

const META: AnswerResponse = {
  requestId: "req-123",
  status: "ok",
  label: "shipping",
  answer: "답변",
  provider: "local",
  model: "hf.co/unsloth/gemma-4-E4B-it-GGUF:Q4_K_M",
  promptVersion: "shipping-v2",
  toolsUsed: [
    { name: "get_weather", args: { location: "서울" }, ok: true, error: null, latencyMs: 300 },
  ],
  latencyMs: 1600,
  usage: { inputTokens: 512, outputTokens: 128 },
  error: null,
  createdAt: "2026-10-13T00:00:00Z",
  classification: CLASSIFICATION,
};

/** 펼치는 줄 (배지가 모인 곳). summary 는 역할이 없어 안의 글자에서 찾아 올라간다 */
function summaryText(): string {
  return screen.getByText("처리 과정 ▸").parentElement?.textContent ?? "";
}

describe("MessageMeta", () => {
  it("배지: 라벨 · 경로 · 검증 결과 · 답변 시간 · 툴 · 모델", () => {
    render(<MessageMeta meta={META} totalMs={3200} />);
    const summary = summaryText();
    expect(summary).toContain("배송");
    expect(summary).toContain("확신 부족");
    expect(summary).toContain("검증 후 변경 → 배송");
    expect(summary).toContain("1.6초");
    expect(summary).toContain("날씨");
    expect(summary).toContain("로컬 · gemma-4-E4B-it-GGUF:Q4_K_M");
  });

  it("펼치면 분류기 확률 · 경로 규칙 · LLM 검증 · 툴 호출 · 토큰 · 전체 시간", async () => {
    const user = userEvent.setup();
    render(<MessageMeta meta={META} totalMs={3200} />);
    const details = screen.getByRole<HTMLDetailsElement>("group");
    expect(details.open).toBe(false);
    await user.click(screen.getByText("처리 과정 ▸"));
    expect(details.open).toBe(true);

    const text = details.textContent;
    expect(text).toContain("45.0%"); // 분류기 확률 · p1
    expect(text).toContain("분류기 범위 밖 → 최종 배송");
    expect(text).toContain("4.0%"); // margin
    expect(text).toContain("p1 < 0.6");
    expect(text).toContain("배송 지연 문의"); // 검증 근거
    expect(text).toContain("0.8초");
    expect(text).toContain('{"location":"서울"}');
    expect(text).toContain("512 / 128");
    expect(text).toContain("3.2초"); // 화면에서 잰 전체 시간
    expect(text).toContain("shipping-v2");
    expect(text).toContain("req-123");
  });

  it("분류를 거치지 않은 답변은 분류 · 경로 · 검증을 숨긴다", () => {
    render(<MessageMeta meta={{ ...META, classification: null, toolsUsed: [] }} />);
    const text = screen.getByRole("group").textContent;
    expect(text).not.toContain("분류기 확률");
    expect(text).not.toContain("경로 규칙");
    expect(text).not.toContain("LLM 검증");
    expect(text).not.toContain("툴 호출");
    expect(text).not.toContain("전체 (분류");
  });

  it("범위 밖 문의는 라벨과 경로 배지가 겹치지 않는다", () => {
    const unknown: RoutingResult = {
      ...CLASSIFICATION,
      label: "unknown",
      route: { route: "unknown", p1: 0.43, margin: 0.06, reason: "p1 < tau_low" },
      verification: null,
    };
    render(<MessageMeta meta={{ ...META, label: "unknown", classification: unknown }} />);
    expect(summaryText().match(/범위 밖/g)).toHaveLength(1);
  });

  it("done 전에 받은 classification을 쓸 수 있다", () => {
    render(
      <MessageMeta meta={{ ...META, classification: null }} classification={CLASSIFICATION} />,
    );
    expect(summaryText()).toContain("확신 부족");
  });
});
