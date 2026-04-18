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
  if (req.url === '/health' || req.url === '/') return;
  const secret = req.headers['x-internal-secret'];
  if (secret !== config.internalSecret) {
    reply.code(401).send({ error: 'invalid_internal_secret' });
  }
});

app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }));

app.get('/', async (_req, reply) => {
  const healthRes = await app.inject({ method: 'GET', url: '/health' });
  const health = JSON.parse(healthRes.body);
  const statusColor = health.status === 'ok' ? '#22c55e' : '#ef4444';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Service</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}
.container{max-width:800px;margin:0 auto}
.header{display:flex;align-items:center;gap:1rem;margin-bottom:2rem}
.status-dot{width:12px;height:12px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor}}
h1{font-size:1.5rem;font-weight:600}
.card{background:#1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}
.card h2{font-size:1rem;color:#94a3b8;margin-bottom:1rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:500}
.health-json{background:#0f172a;border-radius:8px;padding:1rem;font-family:monospace;font-size:0.875rem;color:#67e8f9;overflow-x:auto}
.endpoint{display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid #334155}
.endpoint:last-child{border-bottom:none}
.method{font-size:0.75rem;font-weight:700;padding:0.25rem 0.5rem;border-radius:4px;font-family:monospace;min-width:3.5rem;text-align:center}
.method.GET{background:#22d3ee20;color:#22d3ee}.method.POST{background:#a78bfa20;color:#a78bfa}
.path{font-family:monospace;font-size:0.875rem;color:#f8fafc}
.desc{font-size:0.75rem;color:#64748b;margin-left:auto}
.badge{display:inline-block;font-size:0.625rem;padding:0.125rem 0.375rem;border-radius:4px;background:#f59e0b20;color:#f59e0b;margin-left:0.5rem}
</style></head><body><div class="container">
<div class="header"><div class="status-dot"></div><h1>\uD83D\uDD14 Notification Service</h1><span style="color:#64748b;font-size:0.875rem">Port 8004</span></div>
<div class="card"><h2>Health</h2><div class="health-json">${JSON.stringify(health, null, 2)}</div></div>
<div class="card"><h2>API Endpoints</h2>
<div class="endpoint"><span class="method GET">GET</span><span class="path">/health</span><span class="desc">Health check</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/notify</span><span class="desc">Send notification (email + push)</span><span class="badge">internal</span></div>
<div class="endpoint"><span class="method POST">POST</span><span class="path">/push</span><span class="desc">Send push notification</span><span class="badge">internal</span></div>
</div></div></body></html>`;
  return reply.type('text/html').send(html);
});

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
