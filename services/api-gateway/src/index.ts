import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { ZodError } from 'zod';

import { config } from './config.js';
import authPlugin from './authPlugin.js';
import { registerAuthRoutes } from './auth.js';
import { registerProxies } from './proxy.js';
import { registerWebSocket } from './ws.js';

const app = Fastify({
  logger: { level: config.logLevel },
  requestTimeout: config.requestTimeoutMs,
  keepAliveTimeout: config.keepAliveTimeoutMs,
  bodyLimit: config.bodyLimitBytes,
});

await app.register(sensible);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request payload';
    return reply.code(400).send({
      error: 'validation_error',
      message,
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({
      error: 'request_error',
      message: error.message || 'Request failed',
    });
  }

  app.log.error(error);
  return reply.code(500).send({
    error: 'internal_server_error',
    message: 'Unexpected server error',
  });
});

// Security headers
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:*'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
});

// Rate limiting: stricter for auth, relaxed for normal API
await app.register(rateLimit, {
  max: config.rateLimitPerMinute,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, else by IP
    return req.user?.sub ?? req.ip;
  },
});

await app.register(authPlugin);

// Strict rate limit on auth endpoints
app.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

app.get('/', async (_req, reply) => {
  const health = { status: 'ok', service: 'api-gateway' };
  const statusColor = '#22c55e';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Gateway</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}
.container{max-width:800px;margin:0 auto}
.header{display:flex;align-items:center;gap:1rem;margin-bottom:2rem}
.status-dot{width:12px;height:12px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor}}
h1{font-size:1.5rem;font-weight:600}
.card{background:#1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}
.card h2{font-size:1rem;color:#94a3b8;margin-bottom:1rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:500}
.health-json{background:#0f172a;border-radius:8px;padding:1rem;font-family:monospace;font-size:0.875rem;color:#67e8f9;overflow-x:auto;white-space:pre}
.endpoint{display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid #334155}
.endpoint:last-child{border-bottom:none}
.method{font-size:0.75rem;font-weight:700;padding:0.25rem 0.5rem;border-radius:4px;font-family:monospace;min-width:3.5rem;text-align:center}
.method.GET{background:#22d3ee20;color:#22d3ee}.method.POST{background:#a78bfa20;color:#a78bfa}.method.PUT{background:#fbbf2420;color:#fbbf24}.method.DELETE{background:#f8717120;color:#f87171}
.path{font-family:monospace;font-size:0.875rem;color:#f8fafc}
.desc{font-size:0.75rem;color:#64748b;margin-left:auto}
.badge{display:inline-block;font-size:0.625rem;padding:0.125rem 0.375rem;border-radius:4px;margin-left:0.5rem}
.badge.auth{background:#3b82f620;color:#3b82f6}.badge.public{background:#22c55e20;color:#22c55e}
.services{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem}
.svc{background:#0f172a;border-radius:8px;padding:1rem;text-decoration:none;color:#e2e8f0;border:1px solid #334155;transition:border-color 0.2s}
.svc:hover{border-color:#38bdf8}
.svc-name{font-weight:600;margin-bottom:0.25rem}.svc-port{color:#64748b;font-size:0.75rem;font-family:monospace}
</style></head><body><div class="container">
<div class="header"><div class="status-dot"></div><h1>\\u{1F310} API Gateway</h1><span style="color:#64748b;font-size:0.875rem">Port 8001</span></div>
<div class="card"><h2>Health</h2><div class="health-json">${JSON.stringify(health, null, 2)}</div></div>
<div class="card"><h2>Backend Services</h2><div class="services">
<a class="svc" href="http://localhost:8002"><div class="svc-name">\\u{1F4E6} Order Service</div><div class="svc-port">:8002</div></a>
<a class="svc" href="http://localhost:8003"><div class="svc-name">\\u{1F4DA} Catalog Service</div><div class="svc-port">:8003</div></a>
<a class="svc" href="http://localhost:8004"><div class="svc-name">\\u{1F514} Notification Service</div><div class="svc-port">:8004</div></a>
<a class="svc" href="http://localhost:8005"><div class="svc-name">\\u{1F916} AI Service</div><div class="svc-port">:8005</div></a>
</div></div>
<div class="card"><h2>API Endpoints (Proxied)</h2>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/health</span><span class="desc">Gateway health check</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/auth/login</span><span class="desc">Login (email + password)</span><span class="badge public">public</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/auth/register</span><span class="desc">Register new user</span><span class="badge public">public</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/auth/refresh</span><span class="desc">Refresh access token</span><span class="badge public">public</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/auth/me</span><span class="desc">Current user info</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/products</span><span class="desc">List products</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/suppliers</span><span class="desc">List suppliers</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/categories</span><span class="desc">List categories</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/cart</span><span class="desc">View cart</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/api/cart/add</span><span class="desc">Add to cart</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/orders</span><span class="desc">List orders</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/api/orders/checkout</span><span class="desc">Checkout</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/projects</span><span class="desc">List projects</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/api/approvals/rule</span><span class="desc">Approval rules</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/api/ai/chat</span><span class="desc">AI chat</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/api/ai/chat/stream</span><span class="desc">AI streaming chat</span><span class="badge auth">auth</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/api/ingest/supplier-file</span><span class="desc">Ingest supplier data</span><span class="badge auth">auth</span></div>
</div></div></body></html>`;
  return reply.type('text/html').send(html);
});

registerAuthRoutes(app);
await registerWebSocket(app);
await registerProxies(app);

// Auth-specific rate limits (after routes registered)
app.addHook('onRoute', (routeOptions) => {
  if (routeOptions.url?.startsWith('/auth/login') || routeOptions.url?.startsWith('/auth/register')) {
    const orig = routeOptions.preHandler;
    routeOptions.config = {
      ...routeOptions.config,
      rateLimit: { max: 10, timeWindow: '1 minute' },
    };
  }
});

app.listen({ port: config.port, host: '0.0.0.0' })
  .then(() => app.log.info(`api-gateway listening on ${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
