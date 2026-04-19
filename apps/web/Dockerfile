# ─── base: install dependencies ───────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /workspace/apps/web

# Install dependencies inside the Linux image to avoid host binary mismatches
COPY apps/web/package.json ./
RUN npm install --no-audit --no-fund

# ─── dev: hot-reload dev server (used by docker-compose target: dev) ──────────
FROM base AS dev
COPY apps/web/ .
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]

# ─── build: produce the production bundle ─────────────────────────────────────
FROM base AS build
COPY apps/web/ .
RUN npm run build

# ─── prod: serve the production bundle locally via Vite preview ───────────────
FROM base AS prod
COPY apps/web/ .
COPY --from=build /workspace/apps/web/dist ./dist
EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
