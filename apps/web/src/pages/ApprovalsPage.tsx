import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import {
  type ApprovalRule,
  type OrderSummary,
  formatDate,
  formatMoney,
  sentenceCaseStatus,
} from '../lib/procurement';

export function ApprovalsPage(): JSX.Element {
  const qc = useQueryClient();
  const { data } = useQuery<OrderSummary[]>({
    queryKey: ['orders', 'pending'],
    queryFn: async () => (await api.get('/api/orders?status=pending_approval')).data,
  });
  const { data: categories } = useQuery<Array<{ name: string; product_count: number }>>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/api/categories')).data,
  });
  const { data: rule } = useQuery<ApprovalRule | null>({
    queryKey: ['approval-rule'],
    queryFn: async () => (await api.get('/api/approvals/rule')).data,
  });

  const [thresholdAmount, setThresholdAmount] = useState('200');
  const [autoApproveBelow, setAutoApproveBelow] = useState(true);
  const [approverRole, setApproverRole] = useState('project_manager');
  const [restrictedCategories, setRestrictedCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!rule) return;
    setThresholdAmount(String(rule.threshold_amount));
    setAutoApproveBelow(rule.auto_approve_below);
    setApproverRole(rule.approver_role);
    setRestrictedCategories(rule.restricted_categories);
  }, [rule]);

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/api/orders/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'pending'] });
    },
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/orders/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'pending'] });
    },
  });
  const saveRule = useMutation({
    mutationFn: () =>
      api.put('/api/approvals/rule', {
        threshold_amount: Number(thresholdAmount),
        auto_approve_below: autoApproveBelow,
        restricted_categories: restrictedCategories,
        approver_role: approverRole,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-rule'] }),
  });

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="inline-flex items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Approval desk
            </div>
            <h1 className="mt-4 text-3xl font-bold text-brand">
              Control spend without slowing down the site.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Orders below the agreed limit should move automatically. Expensive
              or sensitive categories should route to the right approver with a
              clear reason.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MiniStat label="Pending" value={String(data?.length ?? 0)} />
              <MiniStat
                label="Threshold"
                value={rule ? formatMoney(rule.threshold_amount, 'CHF') : 'Not set'}
              />
              <MiniStat
                label="Approver"
                value={(rule?.approver_role ?? 'project_manager').replace('_', ' ')}
              />
            </div>
          </div>
          <div className="rounded-[28px] bg-brand-surface/70 p-5">
            <div className="flex items-center gap-2 text-brand">
              <SlidersHorizontal size={18} />
              <div className="panel-title !text-brand/70">Approval policy</div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Auto-approve below
                </label>
                <input
                  className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-card px-4 py-3 text-sm"
                  value={thresholdAmount}
                  onChange={(e) => setThresholdAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Approver role
                </label>
                <select
                  className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-card px-4 py-3 text-sm"
                  value={approverRole}
                  onChange={(e) => setApproverRole(e.target.value)}
                >
                  <option value="project_manager">Project manager</option>
                  <option value="procurement_admin">Procurement admin</option>
                </select>
              </div>
            </div>
            <label className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-card px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={autoApproveBelow}
                onChange={(e) => setAutoApproveBelow(e.target.checked)}
              />
              Allow automatic approval below this amount
            </label>
            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Always review these categories
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(categories ?? []).slice(0, 16).map((category) => {
                  const active = restrictedCategories.includes(category.name);
                  return (
                    <button
                      key={category.name}
                      type="button"
                      className={clsx(
                        'rounded-full border px-3 py-2 text-xs font-semibold transition',
                        active
                          ? 'border-brand bg-brand text-brand-surface'
                          : 'border-brand-line bg-brand-card/80 text-slate-600 hover:border-brand',
                      )}
                      onClick={() =>
                        setRestrictedCategories((current) =>
                          active
                            ? current.filter((entry) => entry !== category.name)
                            : [...current, category.name],
                        )
                      }
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              className="btn-primary mt-5"
              onClick={() => saveRule.mutate()}
              disabled={saveRule.isPending}
            >
              <ShieldCheck size={16} />
              {saveRule.isPending ? 'Saving policy…' : 'Save policy'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {(data ?? []).map((o) => (
          <div key={o.id} className="card p-5 lg:flex lg:items-center lg:justify-between">
            <div className="lg:max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-mono text-xs text-slate-500">{o.id.slice(0, 8)}</div>
                <span className="badge bg-brand-accent text-brand-text">
                  {sentenceCaseStatus(o.status)}
                </span>
              </div>
              <div className="mt-3 text-lg font-semibold text-brand">
                {formatMoney(o.total_amount, o.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Created {formatDate(o.created_at)}
              </div>
              {o.notes && (
                <div className="mt-3 text-sm leading-6 text-slate-600">{o.notes}</div>
              )}
            </div>
            <div className="mt-4 flex gap-2 lg:mt-0">
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
          <div className="card p-8 text-sm text-slate-500">
            Nothing pending. Approval thresholds are doing their job and the queue
            is clear.
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-brand-line/80 bg-brand-card/80 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-lg font-bold text-brand">{value}</div>
    </div>
  );
}
