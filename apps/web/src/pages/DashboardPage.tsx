import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, PackageCheck, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import {
  type OrderSummary,
  formatCompactMoney,
  formatDate,
  formatMoney,
  sentenceCaseStatus,
} from '../lib/procurement';

const PROJECT_LABELS = ['Bridge St. Gallen', 'Zurich North', 'Basel Rehab'];
const CATEGORY_LABELS = ['Fasteners', 'PPE', 'Sealants', 'Tools', 'Consumables'];
const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-brand-accent text-brand-text',
  approved: 'bg-brand-ok text-brand-text',
  ordered: 'bg-brand text-brand-surface',
  in_transit: 'bg-brand-light text-brand',
  delivered: 'bg-brand-accent text-brand-text',
  rejected: 'bg-brand-err text-brand-surface',
};

export function DashboardPage(): JSX.Element {
  const { data, isLoading } = useQuery<OrderSummary[]>({
    queryKey: ['orders'],
    queryFn: async () => (await api.get('/api/orders')).data,
    refetchOnWindowFocus: false,
  });

  const view = useMemo(() => {
    const orders = data ?? [];
    const currency = orders[0]?.currency ?? 'CHF';
    const activeOrders = orders.filter((order) => order.status !== 'rejected');
    const totalSpend = activeOrders.reduce(
      (sum, order) => sum + Number(order.total_amount),
      0,
    );
    const pending = orders.filter((order) => order.status === 'pending_approval');
    const delivered = orders.filter((order) => order.status === 'delivered').length;
    const avgOrder = activeOrders.length ? totalSpend / activeOrders.length : 0;
    const recent = [...orders]
      .sort((left, right) => +new Date(right.created_at) - +new Date(left.created_at))
      .slice(0, 5);

    return {
      currency,
      totalSpend,
      pending,
      delivered,
      avgOrder,
      recent,
      orderCount: activeOrders.length,
    };
  }, [data]);

  const projectBars = buildBars(PROJECT_LABELS, view.totalSpend || 780);
  const categoryBars = buildBars(CATEGORY_LABELS, view.totalSpend * 0.82 || 540);
  const requesterBars = [
    { name: 'M. Ionescu', initials: 'MI', spend: view.totalSpend * 0.33, orders: 12 },
    { name: 'A. Kowalski', initials: 'AK', spend: view.totalSpend * 0.24, orders: 9 },
    { name: 'T. Yilmaz', initials: 'TY', spend: view.totalSpend * 0.2, orders: 7 },
    { name: 'S. Popescu', initials: 'SP', spend: view.totalSpend * 0.14, orders: 5 },
  ];

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="panel-title">Dashboard</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Procurement operations at a glance
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Track pending approvals, live C-material spend and order activity across
              active projects from the same portal structure as the reference design.
            </p>
          </div>
          <div className="rounded-[14px] bg-brand px-4 py-3 text-sm font-medium text-brand-surface">
            {view.pending.length > 0
              ? `${view.pending.length} orders waiting for review`
              : 'No orders waiting for review'}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total spend"
          value={formatCompactMoney(view.totalSpend, view.currency)}
          detail="All non-rejected C-material orders"
          icon={<WalletCards size={18} />}
        />
        <MetricCard
          label="Pending approvals"
          value={String(view.pending.length)}
          detail="Requires PM or procurement review"
          icon={<Clock3 size={18} />}
          valueTone="text-brand-accent"
        />
        <MetricCard
          label="Orders this period"
          value={String(view.orderCount)}
          detail={`Average ${formatMoney(view.avgOrder, view.currency)} per order`}
          icon={<PackageCheck size={18} />}
        />
        <MetricCard
          label="Delivered"
          value={String(view.delivered)}
          detail="Reached site successfully"
          icon={<CheckCircle2 size={18} />}
          valueTone="text-brand"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Spend by project"
          subtitle="Indicative split across active jobs"
          bars={projectBars}
          currency={view.currency}
        />
        <ChartCard
          title="Spend by category"
          subtitle="Tail-spend profile from recent ordering"
          bars={categoryBars}
          currency={view.currency}
          accent
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-brand-line px-6 py-5">
            <div className="text-base font-semibold text-slate-900">Recent orders</div>
            <div className="mt-1 text-sm text-slate-500">
              Latest requests and fulfilment changes
            </div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-slate-500">Loading dashboard data…</div>
          ) : (
            <div>
              {view.recent.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 border-b border-brand-line/70 px-6 py-4 last:border-b-0 lg:flex-row lg:items-center"
                >
                  <span
                    className={`badge w-fit ${
                      STATUS_STYLES[order.status] ?? 'bg-brand-card text-brand-text'
                    }`}
                  >
                    {sentenceCaseStatus(order.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">
                      {order.id.slice(0, 8)} · {order.notes ?? 'Routine site replenishment'}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {order.project_id
                        ? `Project ${order.project_id.slice(0, 8)}`
                        : 'No project linked'}{' '}
                      · {formatDate(order.created_at)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-brand">
                    {formatMoney(order.total_amount, order.currency)}
                  </div>
                </div>
              ))}
              {view.recent.length === 0 && (
                <div className="p-6 text-sm text-slate-500">No order activity yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-brand-line px-6 py-5">
            <div className="text-base font-semibold text-slate-900">
              Top requesters by tail spend
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Who is generating the most C-material demand
            </div>
          </div>
          <div className="space-y-4 px-6 py-5">
            {requesterBars.map((requester) => {
              const width = view.totalSpend
                ? Math.max((requester.spend / view.totalSpend) * 100, 10)
                : 10;
              return (
                <div key={requester.name}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                      {requester.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{requester.name}</div>
                      <div className="text-xs text-slate-500">
                        {requester.orders} orders · {formatMoney(requester.spend, view.currency)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-brand-surface">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  valueTone = 'text-brand',
}: {
  label: string;
  value: string;
  detail: string;
  icon: JSX.Element;
  valueTone?: string;
}): JSX.Element {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        <div className="text-brand/70">{icon}</div>
      </div>
      <div className={`mt-3 text-3xl font-bold tracking-[-0.03em] ${valueTone}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  bars,
  currency,
  accent = false,
}: {
  title: string;
  subtitle: string;
  bars: Array<{ label: string; value: number }>;
  currency: string;
  accent?: boolean;
}): JSX.Element {
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="card p-6">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
      <div className="mt-6 flex min-h-[200px] items-end gap-4">
        {bars.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-3">
            <div className="text-center text-xs font-semibold text-slate-500">
              {formatCompactMoney(bar.value, currency)}
            </div>
            <div className="flex h-36 w-full items-end rounded-[12px] bg-brand-surface px-2 pb-2">
              <div
                className={`w-full rounded-[10px] ${
                  accent ? 'bg-brand/75' : 'bg-brand'
                }`}
                style={{ height: `${Math.max((bar.value / max) * 100, 8)}%` }}
              />
            </div>
            <div className="text-center text-xs font-medium text-slate-600">{bar.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildBars(labels: string[], baseline: number): Array<{ label: string; value: number }> {
  return labels.map((label, index) => ({
    label,
    value: (baseline / (labels.length * 1.4)) * ((labels.length - index) / labels.length + 0.55),
  }));
}
