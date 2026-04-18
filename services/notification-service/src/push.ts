import { config } from './config.js';

let initialized = false;

async function ensureInit(): Promise<typeof import('firebase-admin') | null> {
  if (!config.firebaseServiceAccount) return null;
  const admin = await import('firebase-admin');
  if (!initialized) {
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(config.firebaseServiceAccount, 'utf8');
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw)),
      });
      initialized = true;
    } catch (e) {
      console.warn('[push] Firebase init failed (FCM disabled):', (e as Error).message);
      return null;
    }
  }
  return admin;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  tokens: string[];
}

export async function sendPush(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const admin = await ensureInit();
  if (!admin || payload.tokens.length === 0) {
    console.log('[push] (mock) would send:', payload.title, '->', payload.tokens.length, 'tokens');
    return { sent: 0, failed: 0 };
  }
  const res = await admin.messaging().sendEachForMulticast({
    tokens: payload.tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data ?? {},
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  return { sent: res.successCount, failed: res.failureCount };
}
