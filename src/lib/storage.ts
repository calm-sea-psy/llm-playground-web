// 화면이 쓰는 저장소 계약. 구현은 앱 루트에서 StorageProvider 로 끼운다.

/** 문자열 키-값 저장소. 쓸 수 없는 환경(차단 · 시크릿 창 · 용량 초과)에서는 부를 때 예외를 던진다 */
export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  /**
   * 다른 탭이 저장소를 바꾸면 알린다.
   *
   * @param onChange 바뀐 키를 받는다. 전체를 지웠으면 null
   * @returns 구독을 끊는 함수
   */
  subscribe: (onChange: (key: string | null) => void) => () => void;
}

/** 브라우저 localStorage 구현. 차단된 환경에서는 window.localStorage 를 읽기만 해도 예외라, 부를 때 접근한다 */
export function createBrowserStorage(): KeyValueStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
    subscribe: (onChange) => {
      const handleStorage = (e: StorageEvent): void => onChange(e.key);
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
  };
}
