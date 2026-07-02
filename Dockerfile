# syntax=docker/dockerfile:1

# ---- builder: compile the app (and better-sqlite3's native addon) ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain for building the better-sqlite3 native addon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runner: minimal runtime image ----
# Same base as the builder so the compiled better-sqlite3 binary stays ABI-compatible.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/ledger.db

# Run as the base image's non-root `node` user.
# Next standalone output: server.js + a traced node_modules.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# schema.sql is read at runtime via process.cwd(); it is not a JS import, so
# standalone tracing won't include it — copy it explicitly.
COPY --from=builder --chown=node:node /app/db ./db
# Guarantee the native addon is present even if file-tracing misses the binary.
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Persistent volume for the SQLite database.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data

USER node
EXPOSE 3000
CMD ["node", "server.js"]
