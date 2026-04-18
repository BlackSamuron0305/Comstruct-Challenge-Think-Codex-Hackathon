import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { config } from './config.js';
import { sendEmail, templates } from './email.js';
import { sendPush } from './push.js';

const app = Fastify({
  logger: { level: config.logLevel },
});
await app.register(sensible);

// Internal auth guard
app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/health') return;
  const secret = req.headers['x-internal-secret'];
  if (secret !== config.internalSecret) {
    reply.code(401).send({ error: 'invalid_internal_secret' });
  }
});

app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));

const NotifyBody = z.object({
  event: z.enum([
    'order_pending_approval',
    'order_approved',
    'order_rejected',
    'order_delivered',
  ]),
  payload: z.record(z.any()),
  email_to: z.string().email().optional(),
  push_tokens: z.array(z.string()).optional(),
});

app.post('/notify', async (req, reply) => {
  const body = NotifyBody.parse(req.body);
  const tpl = templates[body.event](body.payload as never);

  const results: Record<string, unknown> = {};

  if (body.email_to) {
    results.email = await sendEmail({
      to: body.email_to,
      subject: tpl.subject,
      html: tpl.html,
    });
  }

  if (body.push_tokens && body.push_tokens.length > 0) {
    results.push = await sendPush({
      title: tpl.subject,
      body: (tpl.html.replace(/<[^>]+>/g, '').slice(0, 200)) || tpl.subject,
      data: Object.fromEntries(
        Object.entries(body.payload).map(([k, v]) => [k, String(v)]),
      ),
      tokens: body.push_tokens,
    });
  }

  return reply.send({ ok: true, ...results });
});

const PushOnlyBody = z.object({
  title: z.string(),
  body: z.string(),
  tokens: z.array(z.string()),
  data: z.record(z.string()).optional(),
});

app.post('/push', async (req, reply) => {
  const body = PushOnlyBody.parse(req.body);
  const r = await sendPush(body);
  return reply.send({ ok: true, ...r });
});

const port = config.port;
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`notification-service listening on ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
