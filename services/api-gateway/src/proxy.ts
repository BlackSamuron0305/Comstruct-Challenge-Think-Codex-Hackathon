import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import { config } from './config.js';

/**
 * Sets X-User-* headers from the verified JWT and attaches the
 * X-Internal-Secret so backend services trust the request.
 */
function injectIdentityHeaders(
  req: FastifyRequest,
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const nextHeaders = { ...headers };

  delete nextHeaders.host;
  delete nextHeaders.connection;
  delete nextHeaders.expect;

  if (req.user) {
    nextHeaders['x-user-id'] = req.user.sub;
    nextHeaders['x-user-role'] = req.user.role;
    nextHeaders['x-company-id'] = req.user.company_id;
    nextHeaders['x-user-email'] = req.user.email;
  }

  nextHeaders['x-internal-secret'] = config.internalSecret;
  return nextHeaders;
}

interface UpstreamSpec {
  prefix: string;
  upstream: string;
  rewritePrefix?: string;
  requireAuth?: boolean;
}

const UPSTREAMS: UpstreamSpec[] = [
  // catalog (read-mostly, public-ish for product browsing — auth still required)
  { prefix: '/api/products', upstream: config.upstream.catalog, rewritePrefix: '/products', requireAuth: true },
  { prefix: '/api/suppliers', upstream: config.upstream.catalog, rewritePrefix: '/suppliers', requireAuth: true },
  { prefix: '/api/categories', upstream: config.upstream.catalog, rewritePrefix: '/categories', requireAuth: true },

  // orders
  { prefix: '/api/cart', upstream: config.upstream.order, rewritePrefix: '/cart', requireAuth: true },
  { prefix: '/api/orders', upstream: config.upstream.order, rewritePrefix: '/orders', requireAuth: true },
  { prefix: '/api/projects', upstream: config.upstream.order, rewritePrefix: '/projects', requireAuth: true },
  { prefix: '/api/approvals', upstream: config.upstream.order, rewritePrefix: '/approvals', requireAuth: true },

  // ai
  { prefix: '/api/ai', upstream: config.upstream.ai, rewritePrefix: '/ai', requireAuth: true },
  { prefix: '/api/ingest', upstream: config.upstream.ai, rewritePrefix: '/ingest', requireAuth: true },
  { prefix: '/api/supplier-scoring', upstream: config.upstream.ai, rewritePrefix: '/suppliers', requireAuth: true },
];

export async function registerProxies(app: FastifyInstance): Promise<void> {
  for (const spec of UPSTREAMS) {
    await app.register(httpProxy, {
      upstream: spec.upstream,
      prefix: spec.prefix,
      rewritePrefix: spec.rewritePrefix ?? spec.prefix,
      replyOptions: {
        rewriteRequestHeaders: (req, headers) => {
          return injectIdentityHeaders(
            req as FastifyRequest,
            headers as Record<string, string | undefined>,
          );
        },
      },
      preHandler: spec.requireAuth
        ? async (req: FastifyRequest, reply: FastifyReply) => {
          if (!req.user) reply.code(401).send({ error: 'unauthorized' });
        }
        : undefined,
    });
  }
}
