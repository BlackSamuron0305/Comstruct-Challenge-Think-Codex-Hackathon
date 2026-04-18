import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import {
  type OrderSummary,
  formatDate,
  formatMoney,
  sentenceCaseStatus,
} from '../lib/procurement';
import { useOrderEvents, type OrderStatusEvent } from '../lib/ws';

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
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<OrderSummary[]>({
    queryKey: ['orders'],
    queryFn: async () => (await api.get('/api/orders')).data,
    refetchOnWindowFocus: false,
  });

  const onWs = useCallback(
    (event: OrderStatusEvent) => {
      qc.setQueryData<OrderSummary[]>(['orders'], (current) =>
        current
          ? current.map((order) =>
              order.id === event.order_id ? { ...order, status: event.status } : order,
            )
          : current,
      );
    },
    [qc],
  );
  useOrderEvents(onWs);

  const visible = useMemo(() => {
    const orders = data ?? [];
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const searchText = `${order.id} ${order.notes ?? ''} ${order.project_id ?? ''}`.toLowerCase();
      const matchesSearch = !search || searchText.includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [data, search, statusFilter]);

  const currency = visible[0]?.currency ?? data?.[0]?.currency ?? 'CHF';
  const totalVisibleSpend = visible.reduce(
    (sum, order) => sum + Number(order.total_amount),
    0,
  );

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="panel-title">Orders</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              All procurement orders
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Review the full C-material order history across approval, fulfilment and
              delivery states in a single table.
            </p>
          </div>
          <div className="rounded-[14px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
            {visible.length} visible orders · {formatMoney(totalVisibleSpend, currency)}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  statusFilter === filter.value
                    ? 'bg-brand text-brand-surface'
                    : 'bg-brand-card text-slate-600 shadow-[0_1px_3px_rgba(0,0,0,0.07)] hover:text-brand',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
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

        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading orders…</div>
        ) : (
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
                    {order.project_id ? order.project_id.slice(0, 8) : 'Unassigned'}
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
        )}
      </section>
    </div>
  );
}
