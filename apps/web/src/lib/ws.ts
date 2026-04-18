import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';

export interface OrderStatusEvent {
  order_id: string;
  status: string;
  ts: string;
}

export interface ApprovalEvent {
  order_id: string;
  action: 'requested' | 'approved' | 'rejected';
  total_amount?: string;
  reason?: string;
}

export interface PriceAlertEvent {
  product_id: string;
  supplier_id: string;
  old_price: string;
  new_price: string;
  currency: string;
}

export interface WsMessage {
  type: string;
  channel: string;
  data: unknown;
}

type Channel = 'order.status' | 'approval' | 'ai.progress' | 'price.alert' | 'sync';

/**
 * Generic WebSocket hook supporting multiple channel types.
 * Connects to the gateway WS and dispatches messages by type.
 */
export function useWebSocket(
  onMessage: (msg: WsMessage) => void,
  options?: { channel?: Channel; id?: string },
): void {
  const token = useAuthStore((s) => s.accessToken);
  const ref = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const url = new URL('/ws', window.location.origin);
    url.protocol = url.protocol.replace('http', 'ws');
    url.searchParams.set('token', token);
    if (options?.channel) url.searchParams.set('channel', options.channel);
    if (options?.id) url.searchParams.set('id', options.id);

    const ws = new WebSocket(url.toString());
    ref.current = ws;

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as WsMessage;
        onMessage(parsed);
      } catch {
        /* ignore */
      }
    };

    return () => ws.close();
  }, [token, options?.channel, options?.id, onMessage]);
}

/** Legacy hook — subscribes to order status updates. */
export function useOrderEvents(
  onEvent: (e: OrderStatusEvent) => void,
  orderId?: string,
): void {
  const token = useAuthStore((s) => s.accessToken);
  const ref = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const url = new URL('/ws', window.location.origin);
    url.protocol = url.protocol.replace('http', 'ws');
    url.searchParams.set('token', token);
    if (orderId) url.searchParams.set('order_id', orderId);

    const ws = new WebSocket(url.toString());
    ref.current = ws;

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === 'order.status' && parsed.data) {
          onEvent(parsed.data);
        }
      } catch {
        /* ignore */
      }
    };

    return () => ws.close();
  }, [token, orderId, onEvent]);
}
