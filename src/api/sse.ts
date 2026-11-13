// text/event-stream 해석. HTML 표준의 SSE 해석 규칙 중 event · data 필드만 쓴다 (id · retry 는 POST 스트림이라 의미가 없다).
// POST 요청이라 브라우저 EventSource 를 쓸 수 없어, fetch 응답 본문을 글로 바꿔 이 해석기에 넣는다.

/** 이름이 없는 이벤트의 이름 (표준) */
const DEFAULT_EVENT = "message";

/** 줄 끝: CRLF · LF · CR 셋 다 받는다 (표준) */
const LINE_END = /\r\n|\n|\r/;

/** 이벤트 하나 */
export interface SseMessage {
  /** event 필드. 없으면 "message" */
  event: string;
  /** data 필드들을 줄바꿈으로 이은 글 */
  data: string;
}

/** 조각으로 오는 이벤트 스트림을 이벤트로 나누는 해석기 */
export interface SseParser {
  /** 받은 글 조각을 넣고, 이 조각으로 끝난 이벤트들을 돌려준다. 조각 경계가 줄 중간이어도 된다 */
  push: (text: string) => SseMessage[];
  /** 스트림이 끝났다. 남은 줄을 마저 읽는다. 빈 줄로 닫히지 않은 이벤트는 버린다 (표준) */
  end: () => SseMessage[];
}

/** 새 해석기. 스트림 하나에 하나씩 쓴다 */
export function createSseParser(): SseParser {
  // 아직 줄 끝을 받지 못한 글
  let buffer = "";
  let event = "";
  let data: string[] = [];

  function readLine(line: string): SseMessage | undefined {
    if (line === "") {
      // 빈 줄: 모은 이벤트를 내보낸다. data 가 하나도 없으면 내보내지 않는다 (표준)
      const message =
        data.length > 0 ? { event: event || DEFAULT_EVENT, data: data.join("\n") } : undefined;
      event = "";
      data = [];
      return message;
    }
    if (line.startsWith(":")) {
      return undefined; // 주석 (연결 유지용 등)
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // 콜론 뒤 공백 하나는 구분용이라 뗀다 (표준)
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
    return undefined;
  }

  function readLines(lines: string[]): SseMessage[] {
    return lines.flatMap((line) => readLine(line) ?? []);
  }

  function push(text: string): SseMessage[] {
    buffer += text;
    // 끝의 CR 은 다음 조각의 LF 와 합쳐 줄 끝 하나(CRLF)일 수 있어 다음 조각까지 남겨 둔다
    const isCrHeld = buffer.endsWith("\r");
    const lines = (isCrHeld ? buffer.slice(0, -1) : buffer).split(LINE_END);
    const rest = lines.pop() ?? "";
    buffer = isCrHeld ? `${rest}\r` : rest;
    return readLines(lines);
  }

  function end(): SseMessage[] {
    // CR 로 끝났으면 그 줄은 끝난 것이다. 줄 끝이 없는 마지막 조각은 이벤트를 닫을 수 없어 버린다
    const lines = buffer.endsWith("\r") ? buffer.slice(0, -1).split(LINE_END) : [];
    buffer = "";
    return readLines(lines);
  }

  return { push, end };
}
