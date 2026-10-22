import { useEffect, useState } from "react";

import { useMediaQuery } from "./useMediaQuery";
import { THEMES, type Theme } from "../lib/labels";

export const THEME_KEY = "seal-frontend:theme";

/** useTheme 이 돌려주는 선택값과 변경 함수 */
export interface UseThemeResult {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * 화면 테마 (시스템 · 라이트 · 다크). 선택은 localStorage 에 남긴다.
 * <html> 에 dark 클래스와 color-scheme(스크롤바 · 폼 요소 색)을 맞춘다. "시스템"이면 OS 설정이 바뀌는 대로 따라간다.
 * (처음 그리기 전에는 index.html 스크립트가 같은 규칙으로 붙인다)
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", false);
  const isDark = theme === "dark" || (theme === "system" && prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);

  function selectTheme(next: Theme): void {
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, next);
      }
    } catch {
      // 저장이 안 되어도 지금 화면에는 적용된다
    }
  }

  return { theme, setTheme: selectTheme };
}

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEMES.find((t) => t !== "system" && t === value) ?? "system";
  } catch {
    return "system";
  }
}
