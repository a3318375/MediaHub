# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /web
RUN npm install -g pnpm@10
COPY --from=web package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=web . .
RUN pnpm build

FROM golang:1.26-bookworm AS backend
WORKDIR /src
COPY . .
RUN if ! grep -q 'func WaitForAsyncTasks' third_party/pansou/plugin/plugin.go; then git -C third_party/pansou apply /src/third_party/pansou-lifecycle.patch; fi \
 && if ! grep -q 'func NewCheckServiceWithCachePath' third_party/pansou/service/check_service.go; then git -C third_party/pansou apply /src/third_party/pansou-check-lifecycle.patch; fi
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/media-center ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /out/media-center /app/media-center
COPY --from=frontend /web/dist /app/web
ENV HTTP_ADDR=:18080 MEDIA_CENTER_DATA_DIR=/data MEDIA_CENTER_WEB_DIR=/app/web TZ=Asia/Hong_Kong GIN_MODE=release
EXPOSE 18080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fsS http://127.0.0.1:18080/api/health || exit 1
ENTRYPOINT ["/app/media-center"]
