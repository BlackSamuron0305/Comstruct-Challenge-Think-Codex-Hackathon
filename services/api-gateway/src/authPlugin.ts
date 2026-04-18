import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken, type JwtClaims } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtClaims;
  }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function plugin(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return;
    try {
      req.user = await verifyToken(auth.slice(7));
    } catch {
      // leave req.user undefined; route guards will reject
    }
  });

  app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });
}

export default fp(plugin);
