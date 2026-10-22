import { useMediaQuery } from "./useMediaQuery";

/** OS 의 "움직임 줄이기" 설정 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)", false);
}
