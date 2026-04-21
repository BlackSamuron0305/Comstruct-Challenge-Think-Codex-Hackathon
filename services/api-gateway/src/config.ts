import 'dotenv/config';

const IS_DEV = (process.env.NODE_ENV ?? 'development') === 'development';

// Fail fast: secret must be explicitly set in production.
const internalSecret = process.env.INTERNAL_SHARED_SECRET;
if (!internalSecret) {
  if (IS_DEV) {
    console.warn('[config] INTERNAL_SHARED_SECRET not set — using insecure dev default. DO NOT use in production.');
  } else {
    throw new Error('INTERNAL_SHARED_SECRET must be set in production');
  }
}

function parseCorsOrigins(value?: string): string[] {
  const configured = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // In dev, also allow localhost on common ports; never in production.
  const devOrigins = IS_DEV
    ? ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8088', 'http://localhost:8090', 'http://127.0.0.1:8090', 'http://localhost:5173']
    : [];

  return Array.from(new Set([...devOrigins, ...configured]));
}

export const config = {
  isDev: IS_DEV,
  port: Number(process.env.SERVICE_PORT ?? 8001),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 100),
  // Auth endpoints get their own tighter limit (per IP).
  authRateLimitPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
  keepAliveTimeoutMs: Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 15000),
  bodyLimitBytes: Number(process.env.BODY_LIMIT_MB ?? 10) * 1024 * 1024,
  // Brute-force lockout: lock account for lockoutWindowMs after maxLoginAttempts failures.
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
  lockoutWindowSec: Number(process.env.LOCKOUT_WINDOW_SEC ?? 900), // 15 minutes

  internalSecret: internalSecret ?? 'dev-internal-secret',
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH ?? '/run/secrets/jwt_private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH ?? '/run/secrets/jwt_public.pem',
  jwtIssuer: process.env.JWT_ISSUER ?? 'comstruct-gateway',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'comstruct-clients',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',  // was 30d — reduced for security

  // Cookie config: httpOnly in all envs; Secure only over HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as 'strict' | 'lax' | 'none',

  redisUrl: process.env.REDIS_URL ?? 'redis://:dev_password@redis:6379/0',

  upstream: {
    catalog: process.env.CATALOG_SERVICE_URL ?? 'http://catalog-service:8003',
    order: process.env.ORDER_SERVICE_URL ?? 'http://order-service:8002',
    notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:8004',
    ai: process.env.AI_SERVICE_URL ?? 'http://ai-service:8005',
  },
} as const;
