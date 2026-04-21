# notification-service

Delivers email and push notifications triggered by order lifecycle events. Internal-only service — not exposed through the api-gateway to external clients.

**Port:** `8004`  
**Stack:** TypeScript · Node.js · Fastify 4 · Resend (email) · Firebase Admin SDK (FCM) · @parse/node-apn (APNs) · ioredis · Zod

## Responsibilities

- Receives event payloads from order-service via `x-internal-secret` authenticated calls
- Dispatches templated email via Resend
- Sends push notifications via FCM (Android/web) and APNs (iOS)
- Supports events: `order_pending_approval`, `order_approved`, `order_rejected`, `order_delivered`

## Source layout

```
src/
  index.ts      — Fastify app, /notify and /push route handlers
  email.ts      — Resend email client + message templates
  push.ts       — FCM and APNs dispatch
  config.ts     — env-driven configuration
```

## Local development

```bash
cd services/notification-service
pnpm install
pnpm dev      # ts-node-dev with hot reload on :8004
```

Required env vars (from root `.env`):
- `RESEND_API_KEY` — for email delivery
- `FIREBASE_SERVICE_ACCOUNT_JSON` — FCM push credentials (path to JSON file)
- `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID` — APNs push credentials
- `INTERNAL_SHARED_SECRET` — authenticates calls from other services
