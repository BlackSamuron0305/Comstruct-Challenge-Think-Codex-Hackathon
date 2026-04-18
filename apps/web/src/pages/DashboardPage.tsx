import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, PackageCheck, WalletCards } from 'lucide-react';
import {
  type OrderSummary,
  formatCompactMoney,
  formatDate,
  formatMoney,
  sentenceCaseStatus,
} from '../lib/procurement';

const CATEGORY_LABELS = ['Fasteners', 'PPE', 'Sealants', 'Tools', 'Consumables'];
const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-brand-accent text-brand-text',
  approved: 'bg-brand-ok text-brand-text',
  ordered: 'bg-brand text-brand-surface',
  in_transit: 'bg-brand-light text-brand',
  delivered: 'bg-brand-accent text-brand-text',
  rejected: 'bg-brand-err text-brand-surface',
};

type ProjectOption = {
  id: string;
  name: string;
  site_address: string | null;
  trade: string | null;
};

const MOCK_PROJECTS: ProjectOption[] = [
  {
    id: 'proj-bridge-stgallen',
    name: 'Bridge St. Gallen',
    site_address: 'Bruckenstrasse 1, 9000 St. Gallen',
    trade: 'Steel Bridge',
  },
  {
    id: 'proj-zurich-north',
    name: 'Zurich North',
    site_address: 'Thurgauerstrasse 45, 8050 Zurich',
    trade: 'Shell and Core',
  },
  {
    id: 'proj-basel-rehab',
    name: 'Basel Rehab',
    site_address: 'Aeschenplatz 8, 4051 Basel',
    trade: 'Refurbishment',
  },
];

const MOCK_ORDERS: OrderSummary[] = [
  {
    id: '8d8b6f81-5b8d-4a73-95c4-111111111111',
    status: 'pending_approval',
    total_amount: '184.50',
    currency: 'EUR',
    foreman_id: 'foreman-001',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-18T08:25:00.000Z',
    notes: 'Anchor bolts and drill bits for pier reinforcement',
  },
  {
    id: '8d8b6f81-5b8d-4a73-95c4-222222222222',
    status: 'delivered',
    total_amount: '92.10',
    currency: 'EUR',
    foreman_id: 'foreman-001',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-17T10:10:00.000Z',
    notes: 'Safety gloves and consumables for welding crew',
  },
  {
    id: '8d8b6f81-5b8d-4a73-95c4-333333333333',
    status: 'ordered',
    total_amount: '148.20',
    currency: 'EUR',
    foreman_id: 'foreman-002',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-16T06:40:00.000Z',
    notes: 'Sealants and fastening kits for deck assembly',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-444444444444',
    status: 'approved',
    total_amount: '126.40',
    currency: 'EUR',
    foreman_id: 'foreman-003',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-18T09:15:00.000Z',
    notes: 'Electrical boxes and cable fixings for level 2',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-555555555555',
    status: 'pending_approval',
    total_amount: '198.90',
    currency: 'EUR',
    foreman_id: 'foreman-003',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-17T13:30:00.000Z',
    notes: 'PPE replenishment for facade access team',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-666666666666',
    status: 'delivered',
    total_amount: '74.30',
    currency: 'EUR',
    foreman_id: 'foreman-004',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-15T11:05:00.000Z',
    notes: 'Site supplies for concrete breakout zone',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-777777777777',
    status: 'in_transit',
    total_amount: '165.00',
    currency: 'EUR',
    foreman_id: 'foreman-005',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-18T07:55:00.000Z',
    notes: 'Repair mortar and masking material for corridor works',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-888888888888',
    status: 'approved',
    total_amount: '118.75',
    currency: 'EUR',
    foreman_id: 'foreman-005',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-17T08:45:00.000Z',
    notes: 'Cutting discs and protection film for demolition team',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-999999999999',
    status: 'rejected',
    total_amount: '246.00',
    currency: 'EUR',
    foreman_id: 'foreman-006',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-15T14:20:00.000Z',
    notes: 'Urgent tooling request moved to procurement review',
  },
];

export function DashboardPage(): JSX.Element {
  const [selectedProjectId, setSelectedProjectId] = useState(MOCK_PROJECTS[0]?.id ?? '');
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projects = MOCK_PROJECTS;
  const data = useMemo(
    () => MOCK_ORDERS.filter((order) => order.project_id === selectedProjectId),
    [selectedProjectId],
  );

  const view = useMemo(() => {
    const orders = data ?? [];
    const currency = orders[0]?.currency ?? 'EUR';
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

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProjectName =
    selectedProject?.name ??
    `Project ${selectedProjectId.slice(0, 8)}`;
  const categoryBars = buildBars(CATEGORY_LABELS, view.totalSpend * 0.82 || 540);
  const requesterBars = buildRequesterBars(selectedProjectId, view.totalSpend);

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
              Track pending approvals, live C-material spend and order activity one
              project at a time so the dashboard never blends site performance together.
            </p>
            <div className="relative mt-5 max-w-xl">
              <button
                type="button"
                onClick={() => setIsProjectMenuOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-[22px] border border-brand-line bg-brand-surface px-5 py-4 text-left shadow-[0_14px_28px_rgba(15,23,42,0.06)] transition hover:border-brand/40 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Selected project
                  </div>
                  <div className="mt-1 truncate text-lg font-semibold text-slate-900">
                    {selectedProjectName}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {selectedProject?.trade ?? 'Project'} · {selectedProject?.site_address ?? 'No site address'}
                  </div>
                </div>
                <div className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-surface text-brand">
                  <ChevronDown
                    size={18}
                    className={`transition ${isProjectMenuOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {isProjectMenuOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-20 overflow-hidden rounded-[24px] border border-brand-line bg-brand-surface shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
                  <div className="p-3">
                    {projects.map((project) => {
                      const active = project.id === selectedProjectId;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setIsProjectMenuOpen(false);
                          }}
                          className={`flex w-full items-start justify-between rounded-[18px] px-4 py-4 text-left transition ${
                            active
                              ? 'bg-brand text-brand-surface'
                              : 'text-slate-700 hover:bg-brand-surface'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className={`font-semibold ${active ? 'text-brand-surface' : 'text-slate-900'}`}>
                              {project.name}
                            </div>
                            <div className={`mt-1 text-sm ${active ? 'text-brand-surface/80' : 'text-slate-500'}`}>
                              {project.trade ?? 'Project'} · {project.site_address ?? 'No site address'}
                            </div>
                          </div>
                          <div className={`ml-4 text-xs font-semibold uppercase tracking-[0.14em] ${active ? 'text-brand-accent' : 'text-slate-400'}`}>
                            {active ? 'Live' : 'Open'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
          detail={`Non-rejected C-material orders in ${selectedProjectName}`}
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

      <section>
        <ChartCard
          title="Spend by category"
          subtitle={`Tail-spend profile from recent ordering for ${selectedProjectName}`}
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
              Latest requests and fulfilment changes for {selectedProjectName}
            </div>
          </div>
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
                        ? projects.find((project) => project.id === order.project_id)?.name ??
                          `Project ${order.project_id.slice(0, 8)}`
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

function buildRequesterBars(
  projectId: string,
  totalSpend: number,
): Array<{ name: string; initials: string; spend: number; orders: number }> {
  const presets: Record<string, Array<{ name: string; initials: string; ratio: number; orders: number }>> = {
    'proj-bridge-stgallen': [
      { name: 'M. Ionescu', initials: 'MI', ratio: 0.35, orders: 8 },
      { name: 'A. Kowalski', initials: 'AK', ratio: 0.26, orders: 6 },
      { name: 'T. Yilmaz', initials: 'TY', ratio: 0.21, orders: 5 },
      { name: 'S. Popescu', initials: 'SP', ratio: 0.12, orders: 3 },
    ],
    'proj-zurich-north': [
      { name: 'L. Meier', initials: 'LM', ratio: 0.31, orders: 7 },
      { name: 'C. Vogel', initials: 'CV', ratio: 0.28, orders: 6 },
      { name: 'R. Weber', initials: 'RW', ratio: 0.19, orders: 4 },
      { name: 'D. Keller', initials: 'DK', ratio: 0.14, orders: 3 },
    ],
    'proj-basel-rehab': [
      { name: 'E. Santos', initials: 'ES', ratio: 0.34, orders: 6 },
      { name: 'N. Graf', initials: 'NG', ratio: 0.23, orders: 5 },
      { name: 'J. Roth', initials: 'JR', ratio: 0.18, orders: 4 },
      { name: 'P. Huber', initials: 'PH', ratio: 0.11, orders: 2 },
    ],
  };

  return (presets[projectId] ?? []).map((requester) => ({
    name: requester.name,
    initials: requester.initials,
    spend: totalSpend * requester.ratio,
    orders: requester.orders,
  }));
}
