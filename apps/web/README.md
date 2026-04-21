# web

Procurement dashboard for the comstruct platform. Used by procurement managers to approve orders, manage the product catalog, monitor spend analytics, and configure suppliers.

**Port:** `8080` (Docker) · `5173` (local dev via Vite)  
**Stack:** TypeScript · React 19 · Vite · TanStack Router + Query · Tailwind CSS v4 · shadcn/ui · Zod · Recharts · Cloudflare Workers

## Features

- Order queue with approval / rejection workflow
- Product catalog management with bulk operations
- Supplier directory
- Spend analytics dashboard (Recharts)
- Real-time order status via WebSocket
- AI chat widget for procurement queries

## Source layout

```
src/
  router.tsx              — TanStack Router setup
  routes/
    __root.tsx            — root layout, auth guard
    index.tsx             — dashboard home
    orders.tsx            — order management
    catalog.tsx           — product catalog
    approvals.tsx         — approval queue
    suppliers.tsx         — supplier directory
    analytics.tsx         — spend analytics
    policies.tsx          — policy settings
  components/
    auth/                 — login screen, auth context
    dashboard/            — layout, sidebar, topbar
    chat/                 — AI chat widget
    ui/                   — shadcn/ui components
  hooks/                  — custom React hooks
  lib/
    api.ts                — API client (wraps fetch with JWT auth)
    utils.ts              — shared utilities
```

## Local development

```bash
cd apps/web
pnpm install
pnpm dev      # Vite dev server on :5173, proxies /api to localhost:8001
```

Build for production:
```bash
pnpm build    # outputs to dist/
```

Deploy target is Cloudflare Workers (see `wrangler.jsonc`).
