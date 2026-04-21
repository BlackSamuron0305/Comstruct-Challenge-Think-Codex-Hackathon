# api-gateway

Single entry point for all client traffic (mobile + web). Handles JWT authentication, rate limiting, HTTP proxying to downstream services, and WebSocket relay.

**Port:** `8001`  
**Stack:** TypeScript · Node.js · Fastify 4 · @fastify/http-proxy · @fastify/jwt · @fastify/websocket · ioredis · jose · Zod

## Responsibilities

- RS256 JWT issuance (login, refresh, logout) and validation on every request
- Reverse proxy routing: `/api/orders/*` → order-service, `/api/catalog/*` → catalog-service, `/api/ai/*` → ai-service, `/api/notify/*` → notification-service
- WebSocket proxy for live order events
- Rate limiting (configurable via `RATE_LIMIT_PER_MINUTE`)
- Redis-backed token blacklist for logout/rotation
- CORS, Helmet security headers

## Source layout

```
src/
  index.ts        — Fastify app bootstrap
  auth.ts         — /auth/login, /auth/refresh, /auth/logout routes
  authPlugin.ts   — JWT validation Fastify plugin
  jwt.ts          — RS256 sign/verify helpers
  proxy.ts        — HTTP proxy routing table
  ws.ts           — WebSocket proxy
  config.ts       — env-driven configuration
```

## Local development

```bash
cd services/api-gateway
pnpm install
pnpm dev        # ts-node-dev with hot reload on :8001
```

JWT keys are loaded from `infra/keys/jwt_private.pem` / `infra/keys/jwt_public.pem`.  
Generate them once with `make gen-keys` from the repo root.
