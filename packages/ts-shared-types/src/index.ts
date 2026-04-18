import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────
export const OrderStatus = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'ordered',
  'in_transit',
  'delivered',
  'rejected',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const MaterialClass = z.enum(['A', 'B', 'C']);
export type MaterialClass = z.infer<typeof MaterialClass>;

export const UserRole = z.enum([
  'construction_worker',
  'foreman',
  'procurement_worker',
]);
export type UserRole = z.infer<typeof UserRole>;

export const ProductCategory = z.enum([
  'Fasteners',
  'Consumables',
  'PPE',
  'Tools',
  'Electrical',
  'Site Supplies',
  'Piping & Conduit',
]);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const Unit = z.enum([
  'pcs', 'm', 'kg', 't', 'l', 'roll', 'can', 'pair', 'set',
]);
export type Unit = z.infer<typeof Unit>;

// ── Domain models ──────────────────────────────────────────────────
export const Money = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof Money>;

export const Supplier = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
});
export type Supplier = z.infer<typeof Supplier>;

export const Product = z.object({
  id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  sku: z.string(),
  internal_sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: ProductCategory.nullable(),
  material_class: MaterialClass,
  unit: Unit,
  packaging_qty: z.number().positive(),
  unit_price: z.string(),
  currency: z.string().length(3),
  is_active: z.boolean(),
});
export type Product = z.infer<typeof Product>;

export const OrderItem = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  product_id: z.string().uuid(),
  product_snapshot: z.record(z.unknown()),
  quantity: z.number().positive(),
  unit: Unit,
  unit_price: z.string(),
  line_total: z.string(),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const Order = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  foreman_id: z.string().uuid(),
  status: OrderStatus,
  total_amount: z.string(),
  currency: z.string().length(3),
  requires_approval: z.boolean(),
  approver_id: z.string().uuid().nullable(),
  rejection_reason: z.string().nullable(),
  supplier_order_ref: z.string().nullable(),
  requested_delivery: z.string().datetime().nullable(),
  items: z.array(OrderItem).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Order = z.infer<typeof Order>;

export const ApprovalRule = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  threshold_amount: z.string(),
  daily_approval_cap: z.string(),
  auto_approve_below: z.boolean(),
  restricted_categories: z.array(z.string()),
  approver_role: UserRole,
});
export type ApprovalRule = z.infer<typeof ApprovalRule>;

// ── Auth ───────────────────────────────────────────────────────────
export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const TokenPair = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const JwtClaims = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: UserRole,
  company_id: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
  iss: z.string(),
  aud: z.string(),
});
export type JwtClaims = z.infer<typeof JwtClaims>;

// ── WebSocket events ───────────────────────────────────────────────
export const WsSubscribe = z.object({
  action: z.literal('subscribe'),
  orderId: z.string().uuid(),
});

export const WsUnsubscribe = z.object({
  action: z.literal('unsubscribe'),
  orderId: z.string().uuid(),
});

export const WsStatusUpdate = z.object({
  type: z.literal('status_update'),
  orderId: z.string().uuid(),
  status: OrderStatus,
  updatedAt: z.string().datetime(),
});
export type WsStatusUpdate = z.infer<typeof WsStatusUpdate>;
