/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// llm-playground-wiki API (개발 중에는 프록시로 붙여 CORS 를 피한다. wiki 에는 CORS 설정이 없다)
// Windows에서 localhost는 IPv6를 먼저 시도해 요청마다 약 2초 늦으므로 127.0.0.1로 지정한다.
const DEFAULT_API_TARGET = "http://127.0.0.1:8000";

/** 개발 서버에서 /ask 요청을 ms 만큼 늦게 wiki 로 넘긴다. 0 이하면 켜지 않는다 (빌드 결과 · nginx 에는 영향이 없다) */
function delayAsk(ms: number): Plugin {
  return {
    name: "delay-ask",
    apply: (_config, { command }) => command === "serve" && ms > 0,
    configureServer(server) {
      // 여기서 바로 붙인 미들웨어는 Vite 의 프록시보다 먼저 돈다
      server.middlewares.use((req, _res, next) => {
        if (/^\/ask(\?|$)/.test(req.url ?? "")) {
          setTimeout(next, ms);
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 개발 서버 설정은 셸 환경 변수나 .env · .env.local 로 준다 (VITE_ 가 붙지 않아 화면 코드에는 들어가지 않는다)
  const env = loadEnv(mode, import.meta.dirname, "");
  // wiki 주소. 8000 포트를 다른 서버가 쓰고 있으면 바꾼다 (예: WIKI_URL=http://127.0.0.1:8010)
  const apiTarget = env.WIKI_URL || DEFAULT_API_TARGET;
  // /ask 를 이만큼(ms) 늦춘다. wiki 목업은 바로 답하기 시작해 답을 기다리는 화면(물개)을 볼 수 없어 확인할 때만 켠다 (예: ASK_DELAY_MS=3000)
  const askDelayMs = Number(env.ASK_DELAY_MS || 0);

  return {
    plugins: [react(), tailwindcss(), delayAsk(askDelayMs)],
    build: {
      // 로그 서버가 스택을 원본 위치로 바꿀 때 쓴다. hidden 은 JS 에 소스맵 주소를 남기지 않고, Dockerfile 이 파일을 web 이미지 밖으로 옮긴다
      sourcemap: "hidden",
    },
    server: {
      // ^ 로 시작하는 키는 정규식이다. 문자열 키는 앞부분만 맞아도(/healthz · /asking) 넘기므로 계약 경로만 넘긴다.
      // 정규식은 쿼리 문자열까지 붙은 주소에 맞춰 보므로 끝을 (\?|$) 로 막는다 (/ask?mode=agent).
      // /ask 의 이벤트 스트림은 Vite 프록시가 모으지 않고 받는 대로 넘긴다
      proxy: {
        "^/health(\\?|$)": apiTarget,
        "^/ask(\\?|$)": apiTarget,
        "^/search(\\?|$)": apiTarget,
      },
    },
    test: {
      // 기본은 Node 환경. 화면 테스트는 파일 첫 줄 `// @vitest-environment jsdom`
      environment: "node",
    },
  };
});
