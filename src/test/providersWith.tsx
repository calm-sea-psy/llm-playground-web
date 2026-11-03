// 테스트용 Provider 래퍼
import type { ReactNode } from "react";

import type { ApiClient } from "../api/client";
import { createBrowserStorage } from "../lib/storage";
import { ApiProvider } from "../providers/ApiProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { TypewriterMemoryProvider } from "../providers/TypewriterMemoryProvider";

const STORAGE = createBrowserStorage();

/** render · renderHook 의 wrapper: 앱 루트와 같은 Provider 를 감싼다 */
export function providersWith(client: ApiClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <StorageProvider storage={STORAGE}>
        <ApiProvider client={client}>
          <TypewriterMemoryProvider>{children}</TypewriterMemoryProvider>
        </ApiProvider>
      </StorageProvider>
    );
  };
}
