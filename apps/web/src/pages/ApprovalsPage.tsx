import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Order {
  id: string;
  status: string;
  total_amount: string | number;
  currency: string;
  created_at: string;
  notes?: string;
}

export function ApprovalsPage(): JSX.Element {
  const qc = useQueryClient();
  const { data } = useQuery<Order[]>({
    queryKey: ['orders', 'pending'],
    queryFn: async () => (await api.get('/api/orders?status=pending_approval')).data,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/api/orders/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/orders/${id}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Pending approvals</h1>
      <div className="grid gap-3">
        {(data ?? []).map((o) => (
          <div key={o.id} className="card p-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-slate-500">{o.id.slice(0, 8)}</div>
              <div className="font-medium">
                {Number(o.total_amount).toFixed(2)} {o.currency}
              </div>
              <div className="text-xs text-slate-500">
                {new Date(o.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                onClick={() => approve.mutate(o.id)}
                disabled={approve.isPending}
              >
                Approve
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  const reason = window.prompt('Reason for rejection?');
                  if (reason) reject.mutate({ id: o.id, reason });
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {data?.length === 0 && (
          <div className="text-sm text-slate-500">Nothing pending — you're all caught up.</div>
        )}
      </div>
    </div>
  );
}
