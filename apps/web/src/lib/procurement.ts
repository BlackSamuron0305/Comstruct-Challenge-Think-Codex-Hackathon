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
  auto_approve_below: boolean;
  restricted_categories: string[];
  approver_role: string;
}

export function formatMoney(amount: string | number, currency: string): string {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return `${amount} ${currency}`;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatCompactMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
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
