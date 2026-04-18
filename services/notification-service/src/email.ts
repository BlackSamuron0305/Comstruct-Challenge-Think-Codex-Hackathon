import { config } from './config.js';

export interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(req: EmailRequest): Promise<{ id: string | null }> {
  if (!config.resendApiKey) {
    console.log('[email] (mock) would send to', req.to, ':', req.subject);
    return { id: null };
  }
  const { Resend } = await import('resend');
  const resend = new Resend(config.resendApiKey);
  const r = await resend.emails.send({
    from: config.fromEmail,
    to: req.to,
    subject: req.subject,
    html: req.html,
  });
  return { id: r.data?.id ?? null };
}

// ── Templates ────────────────────────────────────────────────────────
export const templates = {
  order_pending_approval: (p: { orderId: string; total: string; currency: string }) => ({
    subject: `Order ${p.orderId.slice(0, 8)} pending approval`,
    html: `<p>An order totalling <strong>${p.total} ${p.currency}</strong> awaits your approval.</p>`,
  }),
  order_approved: (p: { orderId: string }) => ({
    subject: `Order ${p.orderId.slice(0, 8)} approved`,
    html: `<p>Your order has been approved and forwarded to the supplier.</p>`,
  }),
  order_rejected: (p: { orderId: string; reason: string }) => ({
    subject: `Order ${p.orderId.slice(0, 8)} rejected`,
    html: `<p>Your order was rejected. Reason: ${p.reason}</p>`,
  }),
  order_delivered: (p: { orderId: string }) => ({
    subject: `Order ${p.orderId.slice(0, 8)} delivered`,
    html: `<p>Your order has been marked delivered on site.</p>`,
  }),
};
