import { useCallback, useState } from "react";

/** 보이지 않는 글자. 같은 문장을 다시 알릴 때 번갈아 붙여 스크린 리더가 다시 읽게 한다 */
const ZERO_WIDTH_SPACE = "​";

/** useAnnouncer 가 돌려주는 알림 문장과 알리는 함수 */
export interface UseAnnouncerResult {
  /** aria-live 영역에 넣을 문장 */
  message: string;
  announce: (text: string) => void;
}

/** 스크린 리더 알림 (답변 완료 · 중지를 한 번만) */
export function useAnnouncer(): UseAnnouncerResult {
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const announce = useCallback(
    (text: string) => setAnnouncement((a) => ({ text, count: a.count + 1 })),
    [],
  );
  const suffix = announcement.count % 2 === 1 ? ZERO_WIDTH_SPACE : "";
  return { message: announcement.text + suffix, announce };
}
