# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- зависимости ---
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# --- сборка Next.js ---
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Генерация Prisma уже выполнена в deps, а src/generated исключён из контекста.
COPY --from=deps /app/src/generated ./src/generated
RUN pnpm build

# --- веб-приложение (standalone) ---
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# --- воркер и миграции (полные исходники + tsx) ---
FROM base AS tools
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
CMD ["pnpm", "worker"]
