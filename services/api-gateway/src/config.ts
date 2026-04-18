import 'dotenv/config';

export const config = {
  port: Number(process.env.SERVICE_PORT ?? 8001),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),

  internalSecret: process.env.INTERNAL_SHARED_SECRET ?? 'dev-secret',
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH ?? '/run/secrets/jwt_private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH ?? '/run/secrets/jwt_public.pem',
  jwtIssuer: process.env.JWT_ISSUER ?? 'comstruct-gateway',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'comstruct-clients',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',

  redisUrl: process.env.REDIS_URL ?? 'redis://:dev_password@redis:6379/0',

  upstream: {
    catalog: process.env.CATALOG_SERVICE_URL ?? 'http://catalog-service:8003',
    order: process.env.ORDER_SERVICE_URL ?? 'http://order-service:8002',
    notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:8004',
    ai: process.env.AI_SERVICE_URL ?? 'http://ai-service:8005',
  },
} as const;
