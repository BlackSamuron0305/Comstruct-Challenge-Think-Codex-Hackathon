import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fetch } from 'undici';
import { z } from 'zod';
import { config } from './config.js';
import { signAccessToken, signRefreshToken, verifyToken } from './jwt.js';
import { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Redis client for brute-force tracking (graceful degradation if unavailable)
// ---------------------------------------------------------------------------
let redis: Redis | null = null;
try {
  redis = new Redis(config.redisUrl, { lazyConnect: true, enableOfflineQueue: false });
  await redis.connect();
} catch {
  console.warn('[auth] Redis unavailable — account lockout will use in-process fallback.');
  redis = null;
}

// Fallback in-process store when Redis is down.
const localFailures = new Map<string, { count: number; resetAt: number }>();

async function getFailures(key: string): Promise<number> {
  if (redis) {
    const v = await redis.get(key);
    return v ? parseInt(v, 10) : 0;
  }
  const entry = localFailures.get(key);
  if (!entry || entry.resetAt < Date.now()) return 0;
  return entry.count;
}

async function incrementFailures(key: string): Promise<number> {
  if (redis) {
    const v = await redis.incr(key);
    if (v === 1) await redis.expire(key, config.lockoutWindowSec);
    return v;
  }
  const entry = localFailures.get(key);
  if (!entry || entry.resetAt < Date.now()) {
    localFailures.set(key, { count: 1, resetAt: Date.now() + config.lockoutWindowSec * 1000 });
    return 1;
  }
  entry.count++;
  return entry.count;
}

async function clearFailures(key: string): Promise<void> {
  if (redis) { await redis.del(key); return; }
  localFailures.delete(key);
}

function lockoutKey(email: string): string {
  return `login_fail:${email.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------
function setAuthCookies(reply: FastifyReply, access: string, refresh?: string): void {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
  } as const;

  reply.setCookie('access_token', access, { ...base, maxAge: 15 * 60 }); // 15 min

  if (refresh) {
    // Refresh token scoped to /auth so it's not sent on every API request
    reply.setCookie('refresh_token', refresh, { ...base, maxAge: 7 * 24 * 60 * 60, path: '/auth' }); // 7 days
  }
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('access_token', { path: '/' });
  reply.clearCookie('refresh_token', { path: '/auth' });
}

// ---------------------------------------------------------------------------
// Upstream helpers
// ---------------------------------------------------------------------------
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

interface OrderUserResp {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company_id: string;
}

async function verifyCredentialsUpstream(email: string, password: string): Promise<OrderUserResp | null> {
  const r = await fetch(`${config.upstream.order}/internal/auth/verify-credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': config.internalSecret,
    },
    body: JSON.stringify({ email, password }),
  });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`upstream verify failed: ${r.status}`);
  return (await r.json()) as OrderUserResp;
}

async function getUserUpstream(userId: string): Promise<OrderUserResp | null> {
  const r = await fetch(`${config.upstream.order}/internal/auth/users/${userId}`, {
    headers: { 'x-internal-secret': config.internalSecret },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`upstream user fetch failed: ${r.status}`);
  return (await r.json()) as OrderUserResp;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // ── Login ──────────────────────────────────────────────────────────────────
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginBody.parse(req.body);
    const email = body.email.toLowerCase();

    // Brute-force check
    const failKey = lockoutKey(email);
    const failures = await getFailures(failKey);
    if (failures >= config.maxLoginAttempts) {
      return reply.code(429).send({ error: 'account_locked', message: 'Too many failed attempts. Try again later.' });
    }

    const user = await verifyCredentialsUpstream(email, body.password);
    if (!user) {
      await incrementFailures(failKey);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    // Successful login: clear failure counter
    await clearFailures(failKey);

    const access = await signAccessToken({
      sub: user.id, role: user.role, company_id: user.company_id,
      email: user.email, name: user.full_name,
    });
    const refresh = await signRefreshToken(user.id);

    // Tokens go into httpOnly cookies — NOT in response body.
    setAuthCookies(reply, access, refresh);
    return reply.send({ token_type: 'Bearer', user });
  });

  // ── Refresh ────────────────────────────────────────────────────────────────
  app.post('/auth/refresh', async (req, reply) => {
    // Read refresh token from httpOnly cookie (web) or request body (mobile fallback).
    const cookies = req.cookies as Record<string, string | undefined>;
    const cookieRefresh = cookies?.refresh_token;
    const bodyRefresh = (req.body as Record<string, unknown> | undefined)?.refresh_token as string | undefined;
    const rawRefreshToken = cookieRefresh ?? bodyRefresh;

    if (!rawRefreshToken || rawRefreshToken.length < 20) {
      return reply.code(401).send({ error: 'missing_refresh_token' });
    }

    let claims;
    try {
      claims = await verifyToken(rawRefreshToken);
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }
    if ((claims as Record<string, unknown>).type !== 'refresh') {
      return reply.code(401).send({ error: 'not_a_refresh_token' });
    }
    const user = await getUserUpstream(claims.sub);
    if (!user) return reply.code(401).send({ error: 'user_not_found' });

    const access = await signAccessToken({
      sub: user.id, role: user.role, company_id: user.company_id,
      email: user.email, name: user.full_name,
    });

    // Rotate access token cookie; refresh token cookie stays unchanged.
    setAuthCookies(reply, access);
    return reply.send({ token_type: 'Bearer', user });
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  app.post('/auth/logout', async (_req, reply) => {
    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  // ── Me ──────────────────────────────────────────────────────────────────────
  app.get('/auth/me', { preHandler: [app.requireUser] }, async (req: FastifyRequest) => {
    return req.user;
  });

  // ── Registration ────────────────────────────────────────────────────────────
  const RegisterBody = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    full_name: z.string().min(1),
    role: z.enum(['construction_worker', 'foreman', 'procurement_worker']),
    phone: z.string().optional(),
    company_name: z.string().optional(),
    company_id: z.string().uuid().optional(),
    trade: z.string().optional(),
    preferred_language: z.string().default('de'),
    glove_size: z.string().optional(),
  }).refine(d => d.company_name || d.company_id, {
    message: 'Either company_name or company_id is required',
  });

  app.post('/auth/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterBody.parse(req.body);
    const r = await fetch(`${config.upstream.order}/internal/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': config.internalSecret,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json() as { detail?: string };
      return reply.code(r.status).send({ error: err.detail ?? 'Registration failed' });
    }
    const user = await r.json() as { id: string; email: string; full_name: string; role: string; company_id: string };

    const access = await signAccessToken({
      sub: user.id, role: user.role, company_id: user.company_id,
      email: user.email, name: user.full_name,
    });
    const refresh = await signRefreshToken(user.id);

    // Tokens go into httpOnly cookies — NOT in response body.
    setAuthCookies(reply, access, refresh);
    return reply.code(201).send({ token_type: 'Bearer', user });
  });
}
