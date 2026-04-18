import { useMemo } from 'react';
import { ArrowRight, CircleDashed, WalletCards } from 'lucide-react';
import { useProjectContext } from '../context/ProjectContext';
import { ORDERS } from '../lib/mockData';
import { formatDate, formatMoney } from '../lib/procurement';

type BoardColumn = {
  key: 'pending' | 'approved' | 'rejected';
  title: string;
  tone: string;
};

const BOARD_COLUMNS: BoardColumn[] = [
  { key: 'pending', title: 'Pending', tone: 'bg-amber-100 text-slate-900' },
  { key: 'approved', title: 'Approved', tone: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected', title: 'Rejected', tone: 'bg-red-100 text-red-700' },
];

export function DashboardPage(): JSX.Element {
  const { selectedProject } = useProjectContext();

  const projectOrders = useMemo(
    () => ORDERS.filter((order) => order.project_id === selectedProject.id),
    [selectedProject.id],
  );

  const board = useMemo(() => {
    const groups = {
      pending: [] as typeof projectOrders,
      approved: [] as typeof projectOrders,
      rejected: [] as typeof projectOrders,
    };

    for (const order of projectOrders) {
      if (order.status === 'rejected') {
        groups.rejected.push(order);
      } else if (order.status === 'pending_approval') {
        groups.pending.push(order);
      } else {
        groups.approved.push(order);
      }
    }

    return groups;
  }, [projectOrders]);

  const budgetRemaining = selectedProject.budget - selectedProject.budgetSpent;

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="panel-title">Dashboard</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              {selectedProject.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Jira-style procurement flow for {selectedProject.trade.toLowerCase()} work at{' '}
              {selectedProject.site_address}.
            </p>
          </div>
          <div className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-surface">
            {projectOrders.length} requests in view
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <AnalyticsStrip
          label="Budget spent"
          value={formatMoney(selectedProject.budgetSpent, 'EUR')}
          detail={`${Math.round((selectedProject.budgetSpent / selectedProject.budget) * 100)}% of project budget`}
        />
        <AnalyticsStrip
          label="Budget remaining"
          value={formatMoney(budgetRemaining, 'EUR')}
          detail={`${formatMoney(selectedProject.budget, 'EUR')} total allocated`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {BOARD_COLUMNS.map((column) => (
          <div key={column.key} className="rounded-[22px] border border-brand-line bg-white/65 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3 border-b border-brand-line/70 pb-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{column.title}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {board[column.key].length} cards
                </div>
              </div>
              <span className={`badge ${column.tone}`}>{board[column.key].length}</span>
            </div>

            <div className="mt-4 space-y-3">
              {board[column.key].map((order) => (
                <article
                  key={order.id}
                  className="rounded-[20px] border border-brand-line bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-brand">
                        {order.id.slice(0, 8)}
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-slate-900">
                        {order.notes ?? 'Routine site replenishment'}
                      </h3>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatMoney(order.total_amount, order.currency)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{formatDate(order.created_at)}</span>
                    <span>{order.foreman_id.slice(0, 8)}</span>
                  </div>
                </article>
              ))}

              {board[column.key].length === 0 && (
                <div className="rounded-[18px] border border-dashed border-brand-line bg-brand-surface/60 px-4 py-8 text-center text-sm text-slate-500">
                  <div className="flex justify-center">
                    <CircleDashed size={18} />
                  </div>
                  <div className="mt-2">Nothing in {column.title.toLowerCase()} for this project.</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="panel-title">Attention</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Keep the next decision in context
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {selectedProject.manager} is currently responsible for approvals on this site. Review
              requests in the approvals flow when spend exceeds the active policy or contract logic.
            </p>
          </div>
          <div className="rounded-[18px] bg-brand-surface px-4 py-4 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <WalletCards size={16} className="text-brand" />
              Budget health
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span>{projectOrders.filter((order) => order.status === 'pending_approval').length} pending</span>
              <ArrowRight size={14} />
              <span>{projectOrders.filter((order) => order.status === 'rejected').length} blocked</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AnalyticsStrip({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <div className="rounded-[20px] border border-brand-line bg-white/75 px-5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </div>
  );
}
