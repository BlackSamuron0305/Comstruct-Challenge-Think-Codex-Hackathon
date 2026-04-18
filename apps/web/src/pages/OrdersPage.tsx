import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Search } from 'lucide-react';
import {
  type OrderSummary,
  formatDate,
  formatMoney,
  sentenceCaseStatus,
} from '../lib/procurement';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-brand-card text-brand-text',
  pending_approval: 'bg-brand-accent text-brand-text',
  approved: 'bg-brand-ok text-brand-text',
  ordered: 'bg-brand text-brand-surface',
  in_transit: 'bg-brand-light text-brand',
  delivered: 'bg-brand-accent text-brand-text',
  rejected: 'bg-brand-err text-brand-surface',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'rejected', label: 'Rejected' },
];

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

export function OrdersPage(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState(MOCK_PROJECTS[0]?.id ?? 'all');
  const [search, setSearch] = useState('');
  const data = MOCK_ORDERS;

  const projectOptions = MOCK_PROJECTS;

  const visible = useMemo(() => {
    const orders = data ?? [];
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesProject = projectFilter === 'all' || order.project_id === projectFilter;
      const searchText = `${order.id} ${order.notes ?? ''} ${order.project_id ?? ''} ${projectName(order.project_id)}`.toLowerCase();
      const matchesSearch = !search || searchText.includes(search.toLowerCase());
      return matchesStatus && matchesProject && matchesSearch;
    });
  }, [data, projectFilter, search, statusFilter]);

  const currency = visible[0]?.currency ?? data?.[0]?.currency ?? 'EUR';
  const totalVisibleSpend = visible.reduce(
    (sum, order) => sum + Number(order.total_amount),
    0,
  );
  const selectedProject = projectOptions.find((project) => project.id === projectFilter);
  const selectedProjectName =
    selectedProject?.name ?? `Project ${projectFilter.slice(0, 8)}`;
  const selectedStatusLabel =
    FILTERS.find((filter) => filter.value === statusFilter)?.label ?? 'All';

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="panel-title">Orders</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              All procurement orders
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Review the mock C-material order history across approval, fulfilment and
              delivery states with the same project structure used on the dashboard.
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="mt-5 flex w-full max-w-xl items-center justify-between rounded-[24px] px-5 py-4">
                  <div className="min-w-0 text-left">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Selected project
                    </div>
                    <div className="mt-1 truncate text-lg font-semibold text-slate-900">
                      {selectedProjectName}
                    </div>
                    <div className="mt-1 truncate text-sm font-normal text-slate-500">
                      {selectedProject?.trade ?? 'Project'} · {selectedProject?.site_address ?? 'No site address'}
                    </div>
                  </div>
                  <div className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-brand">
                    <ChevronDown size={18} />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[min(28rem,calc(100vw-3rem))]" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Projects</DropdownMenuLabel>
                  {projectOptions.map((project) => (
                    <DropdownMenuItem key={project.id} onSelect={() => setProjectFilter(project.id)}>
                      <div className="min-w-0 pr-4">
                        <div className="font-semibold text-slate-900">{project.name}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {project.trade ?? 'Project'} · {project.site_address ?? 'No site address'}
                        </div>
                      </div>
                      <DropdownMenuShortcut>
                        {project.id === projectFilter ? 'Active' : 'Open'}
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="rounded-[14px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
            {visible.length} visible orders · {formatMoney(totalVisibleSpend, currency)}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 lg:flex-row lg:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[240px] rounded-[20px] px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <div className="min-w-0 text-left">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Status filter
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedStatusLabel}
                  </div>
                </div>
                <div className="pointer-events-none flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-brand">
                  <ChevronDown size={16} />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Statuses</DropdownMenuLabel>
                {FILTERS.map((filter) => (
                  <DropdownMenuItem key={filter.value} onSelect={() => setStatusFilter(filter.value)}>
                    {filter.label}
                    <DropdownMenuShortcut>
                      {filter.value === statusFilter ? 'Active' : 'Show'}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="relative lg:ml-auto">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order ID, notes or project…"
              className="w-full rounded-full border border-brand-line bg-brand-card py-2 pl-10 pr-4 text-sm outline-none lg:w-72"
            />
          </label>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-brand-surface/70 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order) => (
              <tr
                key={order.id}
                className="border-t border-brand-line hover:bg-brand-surface/40"
              >
                <td className="px-4 py-4">
                  <div className="font-mono text-xs font-semibold text-brand">
                    {order.id.slice(0, 8)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(order.created_at)}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-medium text-slate-900">
                    {order.notes ?? 'Routine site replenishment order'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Foreman {order.foreman_id.slice(0, 8)}
                  </div>
                </td>
                <td className="px-4 py-4 text-xs text-slate-500">
                  {projectName(order.project_id)}
                </td>
                <td className="px-4 py-4 font-mono">
                  {formatMoney(order.total_amount, order.currency)}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={clsx(
                      'badge',
                      STATUS_STYLES[order.status] ?? 'bg-brand-card text-brand-text',
                    )}
                  >
                    {sentenceCaseStatus(order.status)}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No orders match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function projectName(projectId: string | null | undefined): string {
  if (!projectId) return 'Unassigned';
  return (
    MOCK_PROJECTS.find((project) => project.id === projectId)?.name ??
    `Project ${projectId.slice(0, 8)}`
  );
}
