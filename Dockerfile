# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN npm install --global pnpm@11.24.0
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/validation/package.json ./packages/validation/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
RUN --mount=type=cache,id=sayadaliyati-pnpm,target=/usr/src/app/.pnpm-store \
    pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tsconfig.json ./
RUN pnpm build
RUN --mount=type=cache,id=sayadaliyati-pnpm,target=/usr/src/app/.pnpm-store \
    pnpm --filter @saydaliyati/api deploy --legacy --prod /opt/api

# Optional one-off migration image; never run migrations on every API startup.
FROM build AS migrate
WORKDIR /usr/src/app/packages/database
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DEV_DATA_DIR=/usr/src/app/dev_data
WORKDIR /usr/src/app
COPY --from=build --chown=node:node /opt/api/ ./
COPY --chmod=755 infrastructure/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
RUN mkdir -p dev_data/imports dev_data/exports dev_data/config \
    && chown -R node:node dev_data
USER node
VOLUME ["/usr/src/app/dev_data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["api-entrypoint"]
CMD ["node", "dist/main.js"]
