import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useProjectContext } from '../context/ProjectContext';
import { ORDERS, getProjectName } from '../lib/mockData';
import { formatDate, formatMoney, sentenceCaseStatus } from '../lib/procurement';
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

export function OrdersPage(): JSX.Element {
  const { selectedProject } = useProjectContext();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const projectOrders = useMemo(
    () => ORDERS.filter((order) => order.project_id === selectedProject.id),
    [selectedProject.id],
  );

  const visible = useMemo(() => {
    return projectOrders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const searchText = `${order.id} ${order.notes ?? ''} ${order.project_id ?? ''} ${getProjectName(order.project_id)}`.toLowerCase();
      const matchesSearch = !search || searchText.includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [projectOrders, search, statusFilter]);

  const currency = visible[0]?.currency ?? projectOrders[0]?.currency ?? 'EUR';
  const totalVisibleSpend = visible.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const selectedStatusLabel =
    FILTERS.find((filter) => filter.value === statusFilter)?.label ?? 'All';

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="panel-title">Orders</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              {selectedProject.name} order history
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Review procurement activity for the currently selected project without mixing site context.
            </p>
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
              placeholder="Search order ID or notes…"
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
                  {getProjectName(order.project_id)}
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
