import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useOrderEvents, type OrderStatusEvent } from '../lib/ws';

interface Order {
  id: string;
  status: string;
  total_amount: string | number;
  currency: string;
  foreman_id: string;
  project_id: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  ordered: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-brand-ok text-white',
  rejected: 'bg-brand-err text-white',
};

export function OrdersPage(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: async () => (await api.get('/api/orders')).data,
    refetchOnWindowFocus: false,
  });

  const onWs = useCallback(
    (e: OrderStatusEvent) => {
      qc.setQueryData<Order[]>(['orders'], (cur) =>
        cur ? cur.map((o) => (o.id === e.order_id ? { ...o, status: e.status } : o)) : cur,
      );
    },
    [qc],
  );
  useOrderEvents(onWs);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Orders</h1>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left bg-brand-surface text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((o) => (
                <tr key={o.id} className="border-t border-brand-line hover:bg-brand-surface/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to={`/orders/${o.id}`} className="text-brand hover:underline">
                      {o.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', STATUS_STYLES[o.status] ?? 'bg-slate-100')}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {Number(o.total_amount).toFixed(2)} {o.currency}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
