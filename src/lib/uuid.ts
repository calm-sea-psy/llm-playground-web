// UUID v4 만들기. crypto.randomUUID 는 안전한 출처(https · localhost)에서만 있어서,
// http 로 연 화면(같은 망의 IP 로 연 Docker 등)에서는 getRandomValues 로 같은 형식을 만든다.

const UUID_BYTE_COUNT = 16;
/** 버전(4)을 적는 바이트 위치 (RFC 9562) */
const VERSION_BYTE_INDEX = 6;
/** 변형(10xx)을 적는 바이트 위치 (RFC 9562) */
const VARIANT_BYTE_INDEX = 8;

/** UUID v4 문자열. 추측할 수 없는 값이라 세션 id 로도 쓴다 */
export function randomUuid(): string {
  return "randomUUID" in crypto ? crypto.randomUUID() : uuidFromRandomValues();
}

function uuidFromRandomValues(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTE_COUNT));
  const hex = Array.from(bytes, (byte, index) =>
    stampVersion(byte, index).toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function stampVersion(byte: number, index: number): number {
  if (index === VERSION_BYTE_INDEX) {
    return (byte & 0x0f) | 0x40;
  }
  if (index === VARIANT_BYTE_INDEX) {
    return (byte & 0x3f) | 0x80;
  }
  return byte;
}
