import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';

import { config } from './config.js';
import authPlugin from './authPlugin.js';
import { registerAuthRoutes } from './auth.js';
import { registerProxies } from './proxy.js';
import { registerWebSocket } from './ws.js';

const app = Fastify({ logger: { level: config.logLevel } });

await app.register(sensible);

// Security headers
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
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
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, else by IP
    return req.user?.sub ?? req.ip;
  },
});

await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(authPlugin);

// Strict rate limit on auth endpoints
app.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

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
