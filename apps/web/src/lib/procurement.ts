export interface OrderSummary {
  id: string;
  status: string;
  total_amount: string | number;
  currency: string;
  foreman_id: string;
  project_id: string | null;
  created_at: string;
  notes?: string | null;
  requires_approval?: boolean;
  rejection_reason?: string | null;
}

export interface ApprovalRule {
  id: string;
  company_id: string;
  threshold_amount: string | number;
  daily_approval_cap: string | number;
  auto_approve_below: boolean;
  restricted_categories: string[];
  approver_role: string;
}

const DISPLAY_CURRENCY = 'EUR';

export function normalizeDisplayCurrency(currency?: string): string {
  const normalized = currency?.trim().toUpperCase();
  return normalized === 'EUR' ? 'EUR' : DISPLAY_CURRENCY;
}

export function formatMoney(amount: string | number, currency: string): string {
  const numeric = Number(amount);
  const displayCurrency = normalizeDisplayCurrency(currency);
  if (Number.isNaN(numeric)) return `${amount} ${currency}`;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: displayCurrency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatCompactMoney(amount: number, currency: string): string {
  const displayCurrency = normalizeDisplayCurrency(currency);
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: displayCurrency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function sentenceCaseStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, (match) => match.toUpperCase());
}
