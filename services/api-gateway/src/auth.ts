import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fetch } from 'undici';
import { z } from 'zod';
import { config } from './config.js';
import { signAccessToken, signRefreshToken, verifyToken } from './jwt.js';

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshBody = z.object({
  refresh_token: z.string().min(20),
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
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginBody.parse(req.body);
    const user = await verifyCredentialsUpstream(body.email, body.password);
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });
    const access = await signAccessToken({
      sub: user.id, role: user.role, company_id: user.company_id,
      email: user.email, name: user.full_name,
    });
    const refresh = await signRefreshToken(user.id);
    return reply.send({
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      user,
    });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = RefreshBody.parse(req.body);
    let claims;
    try {
      claims = await verifyToken(body.refresh_token);
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
    return reply.send({ access_token: access, token_type: 'Bearer' });
  });

  app.get('/auth/me', { preHandler: [app.requireUser] }, async (req: FastifyRequest) => {
    return req.user;
  });

  // ── Registration ───────────────────────────────────────────────────
  const RegisterBody = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    full_name: z.string().min(1),
    role: z.enum(['foreman', 'project_manager', 'supplier_admin']),
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

    // Auto-issue tokens for the new user
    const access = await signAccessToken({
      sub: user.id, role: user.role, company_id: user.company_id,
      email: user.email, name: user.full_name,
    });
    const refresh = await signRefreshToken(user.id);
    return reply.code(201).send({
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      user,
    });
  });
}
