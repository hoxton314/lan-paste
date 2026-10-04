# syntax=docker/dockerfile:1

# ── Build: compile shared, web and server ──
FROM node:22-bookworm-slim AS build
# better-sqlite3 falls back to a source build when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json yarn.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN yarn install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages packages
RUN yarn workspace @lan-paste/shared build \
    && yarn workspace @lan-paste/web build \
    && yarn workspace @lan-paste/server build

# ── Production dependencies only ──
FROM build AS deps
RUN rm -rf node_modules packages/*/node_modules \
    && yarn install --frozen-lockfile --production \
    && yarn cache clean

# ── Runtime ──
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    LAN_PASTE_HOST=0.0.0.0 \
    LAN_PASTE_PORT=3456 \
    LAN_PASTE_DB_PATH=/data/lan-paste.db \
    LAN_PASTE_STORAGE_DIR=/data/storage \
    LAN_PASTE_WEB_DIR=/app/packages/web/dist
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.LAN_PASTE_PORT||3456)+'/api/health',{headers:process.env.LAN_PASTE_API_KEY?{Authorization:'Bearer '+process.env.LAN_PASTE_API_KEY}:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
