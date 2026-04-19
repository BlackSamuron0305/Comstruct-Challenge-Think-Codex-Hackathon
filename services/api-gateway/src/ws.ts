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

type WsClient = {
  send?: (payload: string) => void;
  close?: (code?: number) => void;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  once?: (event: string, listener: (...args: any[]) => void) => void;
  readyState?: number;
};

function resolveSocket(conn: any): WsClient | null {
  if (conn?.socket) return conn.socket as WsClient;
  if (conn?.send || conn?.on) return conn as WsClient;
  return null;
}

function safeSend(socket: WsClient | null, payload: unknown): boolean {
  if (!socket?.send) return false;
  if (typeof socket.readyState === 'number' && socket.readyState !== 1) {
    return false;
  }
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function safeClose(socket: WsClient | null, code = 1008): void {
  try {
    socket?.close?.(code);
  } catch {
    // ignore close failures on torn-down sockets
  }
}

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
    const socket = resolveSocket(conn);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromUrl = url.searchParams.get('token');
    const channel = url.searchParams.get('channel') as ChannelPrefix | null;
    const id = url.searchParams.get('id');
    // Legacy support
    const orderId = url.searchParams.get('order_id');

    if (!socket) {
      req.log.error('WebSocket connection did not expose a usable socket');
      return;
    }

    // If token is provided in URL (legacy), authenticate immediately
    if (tokenFromUrl) {
      let claims: JwtClaims;
      try {
        claims = await verifyToken(tokenFromUrl);
      } catch {
        safeSend(socket, { type: 'error', message: 'invalid token' });
        safeClose(socket, 1008);
        return;
      }
      await setupSubscription(socket, claims, channel, id, orderId);
      return;
    }

    // Message-based auth: wait for first message with token
    safeSend(socket, { type: 'auth_required', message: 'Send {"type":"auth","token":"<jwt>"}' });

    const authTimeout = setTimeout(() => {
      safeSend(socket, { type: 'error', message: 'auth timeout' });
      safeClose(socket, 1008);
    }, 10_000);

    socket.once?.('message', async (raw: Buffer | string) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'auth' || !msg.token) {
          safeSend(socket, { type: 'error', message: 'first message must be {"type":"auth","token":"<jwt>"}' });
          safeClose(socket, 1008);
          return;
        }
        const claims = await verifyToken(msg.token);
        const msgChannel = (msg.channel as ChannelPrefix | null) ?? channel;
        const msgId = msg.id ?? id;
        await setupSubscription(socket, claims, msgChannel, msgId, orderId);
      } catch {
        safeSend(socket, { type: 'error', message: 'invalid token' });
        safeClose(socket, 1008);
      }
    });
  });
}

async function setupSubscription(
  socket: WsClient | null,
  claims: JwtClaims,
  channel: ChannelPrefix | null,
  id: string | null,
  orderId: string | null,
): Promise<void> {
  if (!socket) {
    return;
  }

  const sub = new Redis(config.redisUrl);
  const channels = orderId
    ? [`order.status.${orderId}`]  // legacy single-order mode
    : resolveChannels(claims, channel, id);
  let closed = false;

  await sub.subscribe(...channels);

  sub.on('message', (ch, message) => {
    if (closed) {
      return;
    }

    try {
      const parsed = JSON.parse(message);
      if (parsed.company_id && parsed.company_id !== claims.company_id) {
        return;
      }
      const channelType = ch.split('.').slice(0, 2).join('.');
      if (!safeSend(socket, { type: channelType, channel: ch, data: parsed })) {
        closed = true;
        void sub.quit();
      }
    } catch {
      if (!safeSend(socket, { type: 'raw', channel: ch, data: message })) {
        closed = true;
        void sub.quit();
      }
    }
  });

  socket.on?.('close', () => {
    closed = true;
    void sub.quit();
  });

  socket.on?.('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'subscribe' && msg.channel) {
        const newChannels = resolveChannels(claims, msg.channel, msg.id);
        void sub.subscribe(...newChannels);
        safeSend(socket, { type: 'subscribed', channels: newChannels });
      }
    } catch {
      // ignore malformed client messages
    }
  });

  safeSend(socket, {
    type: 'hello',
    user_id: claims.sub,
    subscribed: channels,
  });
}
