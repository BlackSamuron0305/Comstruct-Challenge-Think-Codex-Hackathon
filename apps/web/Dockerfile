# ─── base: install dependencies ───────────────────────────────────────────────
FROM oven/bun:1-alpine AS base
WORKDIR /workspace/apps/web

# Copy only the lockfile + manifest first so Docker can cache the layer
COPY apps/web/package.json apps/web/bun.lockb ./
RUN bun install --frozen-lockfile

# ─── dev: hot-reload dev server (used by docker-compose target: dev) ──────────
FROM base AS dev
# Source files are volume-mounted at runtime; copy here for standalone use
COPY apps/web/ .
EXPOSE 8080
# --host makes Vite bind to 0.0.0.0 so Docker port-mapping works
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]

# ─── build: produce the production bundle ─────────────────────────────────────
FROM base AS build
COPY apps/web/ .
RUN bun run build

# ─── prod: serve the production bundle locally via Vite preview ───────────────
FROM base AS prod
COPY apps/web/ .
COPY --from=build /workspace/apps/web/dist ./dist
EXPOSE 4173
CMD ["bun", "run", "preview", "--host", "0.0.0.0"]
