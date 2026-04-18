/**
 * WebSocket bridge: client connects → /ws?token=<jwt>&channel=<channel>&id=<uuid?>
 *
 * Channels (subscribe via Redis pub/sub):
 *   - "order.status.<order_id>"    per-order status updates
 *   - "order.status"               company-wide order broadcasts
 *   - "approval.<company_id>"      approval requests/decisions
 *   - "ai.progress.<job_id>"       AI/scraping job progress
 *   - "price.alert.<company_id>"   price change alerts
 *   - "sync.<user_id>"             offline sync notifications
 */
import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';
import { config } from './config.js';
import { verifyToken, type JwtClaims } from './jwt.js';

const VALID_CHANNELS = ['order.status', 'approval', 'ai.progress', 'price.alert', 'sync'] as const;
type ChannelPrefix = typeof VALID_CHANNELS[number];

function resolveChannels(
  claims: JwtClaims,
  channel: ChannelPrefix | null,
  id: string | null,
): string[] {
  const channels: string[] = [];

  if (!channel || channel === 'order.status') {
    channels.push(id ? `order.status.${id}` : 'order.status');
  }
  if (!channel || channel === 'approval') {
    channels.push(`approval.${claims.company_id}`);
  }
  if (channel === 'ai.progress' && id) {
    channels.push(`ai.progress.${id}`);
  }
  if (!channel || channel === 'price.alert') {
    channels.push(`price.alert.${claims.company_id}`);
  }
  if (!channel || channel === 'sync') {
    channels.push(`sync.${claims.sub}`);
  }

  return channels.length > 0 ? channels : ['order.status'];
}

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get('/ws', { websocket: true }, async (conn, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromUrl = url.searchParams.get('token');
    const channel = url.searchParams.get('channel') as ChannelPrefix | null;
    const id = url.searchParams.get('id');
    // Legacy support
    const orderId = url.searchParams.get('order_id');

    // If token is provided in URL (legacy), authenticate immediately
    if (tokenFromUrl) {
      let claims: JwtClaims;
      try {
        claims = await verifyToken(tokenFromUrl);
      } catch {
        conn.socket.send(JSON.stringify({ type: 'error', message: 'invalid token' }));
        conn.socket.close(1008);
        return;
      }
      await setupSubscription(conn, claims, channel, id, orderId);
      return;
    }

    // Message-based auth: wait for first message with token
    conn.socket.send(JSON.stringify({ type: 'auth_required', message: 'Send {"type":"auth","token":"<jwt>"}' }));

    const authTimeout = setTimeout(() => {
      conn.socket.send(JSON.stringify({ type: 'error', message: 'auth timeout' }));
      conn.socket.close(1008);
    }, 10_000);

    conn.socket.once('message', async (raw: Buffer | string) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'auth' || !msg.token) {
          conn.socket.send(JSON.stringify({ type: 'error', message: 'first message must be {"type":"auth","token":"<jwt>"}' }));
          conn.socket.close(1008);
          return;
        }
        const claims = await verifyToken(msg.token);
        const msgChannel = (msg.channel as ChannelPrefix | null) ?? channel;
        const msgId = msg.id ?? id;
        await setupSubscription(conn, claims, msgChannel, msgId, orderId);
      } catch {
        conn.socket.send(JSON.stringify({ type: 'error', message: 'invalid token' }));
        conn.socket.close(1008);
      }
    });
  });
}

async function setupSubscription(
  conn: any,
  claims: JwtClaims,
  channel: ChannelPrefix | null,
  id: string | null,
  orderId: string | null,
): Promise<void> {
  const sub = new Redis(config.redisUrl);
  const channels = orderId
    ? [`order.status.${orderId}`]  // legacy single-order mode
    : resolveChannels(claims, channel, id);

  await sub.subscribe(...channels);

  sub.on('message', (ch, message) => {
    try {
      const parsed = JSON.parse(message);
      // Scope company-wide broadcasts by company_id
      if (parsed.company_id && parsed.company_id !== claims.company_id) {
        return;
      }
      const channelType = ch.split('.').slice(0, 2).join('.');
      conn.socket.send(JSON.stringify({ type: channelType, channel: ch, data: parsed }));
    } catch {
      conn.socket.send(JSON.stringify({ type: 'raw', channel: ch, data: message }));
    }
  });

  conn.socket.on('close', () => {
    void sub.quit();
  });

  // Handle client-side messages (e.g., subscribe to additional channels)
  conn.socket.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'subscribe' && msg.channel) {
        const newChannels = resolveChannels(claims, msg.channel, msg.id);
        void sub.subscribe(...newChannels);
        conn.socket.send(JSON.stringify({ type: 'subscribed', channels: newChannels }));
      }
    } catch {
      // ignore malformed client messages
    }
  });

  conn.socket.send(JSON.stringify({
    type: 'hello',
    user_id: claims.sub,
    subscribed: channels,
  }));
}
