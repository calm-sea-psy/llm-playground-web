# 화면 이미지: Node 로 정적 파일을 빌드하고 nginx 로 서빙한다.
# nginx 가 /health · /query 를 백엔드(BACKEND_URL)로 넘겨, 브라우저는 같은 주소만 부른다 (CORS 불필요).

FROM node:24-alpine AS build
WORKDIR /app

# 의존성만 먼저 설치 (package*.json 이 그대로면 이 층은 캐시를 쓴다)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# 빌드 때 화면에 박히는 값. http = 실제 백엔드, mock = 서버 없이 목업
ARG VITE_API_MODE=http
ENV VITE_API_MODE=$VITE_API_MODE
RUN npm run build

FROM nginx:stable-alpine
# 시작할 때 nginx 이미지가 templates/*.template 의 ${BACKEND_URL} 을 채워 conf.d 에 둔다
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://host.docker.internal:8000
EXPOSE 80
