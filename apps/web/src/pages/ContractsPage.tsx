import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, TimerReset } from 'lucide-react';
import { CONTRACTS, PROJECTS } from '../lib/mockData';

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Draft: 'bg-brand-surface text-slate-900',
  Expired: 'bg-red-100 text-red-700',
};

export function ContractsPage(): JSX.Element {
  const [selectedContractId, setSelectedContractId] = useState(CONTRACTS[0]?.id ?? '');
  const selectedContract =
    CONTRACTS.find((contract) => contract.id === selectedContractId) ?? CONTRACTS[0];

  const summary = useMemo(() => {
    const active = CONTRACTS.filter((contract) => contract.status === 'Active').length;
    const expired = CONTRACTS.filter((contract) => contract.status === 'Expired').length;
    const avgDiscount = Math.round(
      CONTRACTS.reduce((sum, contract) => sum + contract.discount, 0) / CONTRACTS.length,
    );

    return { active, expired, avgDiscount };
  }, []);

  if (!selectedContract) {
    return <div className="text-sm text-slate-500">No contracts available.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="panel-title">Contracts</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Supplier agreements with clearer decision structure
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Start from the contract summary, move into commercial details, then take the next procurement action.
            </p>
          </div>
          <Link to="/ingest" className="btn-primary">
            Upload price list
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<ShieldCheck size={16} />} label="Active contracts" value={String(summary.active)} />
        <SummaryCard icon={<TimerReset size={16} />} label="Expired contracts" value={String(summary.expired)} />
        <SummaryCard icon={<FileText size={16} />} label="Average discount" value={`${summary.avgDiscount}%`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[24px] border border-brand-line bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
          <div className="px-2 pb-4">
            <div className="text-base font-semibold text-slate-900">Contract list</div>
            <div className="mt-1 text-sm text-slate-500">Choose an agreement to inspect details and actions.</div>
          </div>
          <div className="space-y-3">
            {CONTRACTS.map((contract) => (
              <button
                key={contract.id}
                type="button"
                onClick={() => setSelectedContractId(contract.id)}
                className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${
                  contract.id === selectedContract.id
                    ? 'border-brand bg-brand-surface shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
                    : 'border-brand-line bg-white hover:bg-brand-surface/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{contract.supplier}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{contract.id}</div>
                  </div>
                  <span className={`badge ${STATUS_STYLES[contract.status]}`}>{contract.status}</span>
                </div>
                <div className="mt-3 text-sm text-slate-600">{contract.summary}</div>
                <div className="mt-3 text-xs text-slate-500">Expires {contract.expires}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-brand-line bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
            <div className="panel-title">Summary</div>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {selectedContract.supplier}
                </h2>
                <div className="mt-1 font-mono text-xs text-slate-500">{selectedContract.id}</div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
                  {selectedContract.summary}
                </p>
              </div>
              <span className={`badge ${STATUS_STYLES[selectedContract.status]}`}>{selectedContract.status}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <ContractMetric label="Discount" value={`${selectedContract.discount}%`} />
              <ContractMetric label="Payment" value={`${selectedContract.paymentDays} days`} />
              <ContractMetric label="Min. order" value={`EUR ${selectedContract.minOrder}`} />
              <ContractMetric label="Owner" value={selectedContract.owner} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-brand-line bg-white p-5">
              <div className="panel-title">Details</div>
              <div className="mt-4 space-y-3">
                <DetailRow label="Signed" value={selectedContract.signed} />
                <DetailRow label="Expires" value={selectedContract.expires} />
                {selectedContract.clauses.map((clause) => (
                  <DetailRow key={clause.label} label={clause.label} value={clause.value} />
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-brand-line bg-white p-5">
              <div className="panel-title">Coverage</div>
              <div className="mt-4 space-y-3">
                {selectedContract.projects.map((projectId) => (
                  <div key={projectId} className="rounded-[18px] bg-brand-surface px-4 py-3 text-sm text-slate-900">
                    {PROJECTS.find((project) => project.id === projectId)?.name ?? projectId}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-brand-line bg-white p-5">
            <div className="panel-title">Actions</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {selectedContract.actions.map((action) => (
                <div key={action} className="rounded-[18px] bg-brand-surface px-4 py-4 text-sm font-medium text-slate-900">
                  {action}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-[22px] border border-brand-line bg-white px-5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ContractMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-[18px] bg-brand-surface px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-brand-line/70 pb-3 last:border-b-0 last:pb-0">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="max-w-[60%] text-right text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
