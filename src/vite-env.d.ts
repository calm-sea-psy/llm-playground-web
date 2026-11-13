/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 연결 방식 (lib/config.ts 의 API_MODE). http · mock, 비우면 개발 서버는 mock · 운영 빌드는 http */
  readonly VITE_API_MODE?: string;
  /** API 주소 (lib/config.ts 의 API_BASE). 비우면 같은 주소로 보낸다 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
