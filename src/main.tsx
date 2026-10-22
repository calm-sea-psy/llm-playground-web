import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import type { ApiClient } from "./api/client";
import { createHttpApiClient } from "./api/httpClient";
import { createMockApiClient } from "./api/mockClient";
import { App } from "./App";
import { API_BASE, API_MODE, HEALTH_TIMEOUT_MS } from "./lib/config";
import { ApiProvider } from "./providers/ApiProvider";
import { TypewriterMemoryProvider } from "./providers/TypewriterMemoryProvider";

// 앱 전체가 쓰는 API 클라이언트는 여기서 한 번만 만든다
const api: ApiClient =
  API_MODE === "http"
    ? createHttpApiClient({ baseUrl: API_BASE, healthTimeoutMs: HEALTH_TIMEOUT_MS })
    : createMockApiClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider client={api}>
      <TypewriterMemoryProvider>
        <App />
      </TypewriterMemoryProvider>
    </ApiProvider>
  </StrictMode>,
);
