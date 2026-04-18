const CONTRACTS = [
  {
    id: 'RV-2024-WR-001',
    supplier: 'Wurth',
    status: 'Active',
    signed: '01 Jan 2024',
    expires: '31 Dec 2026',
    discount: 5,
    paymentDays: 30,
    minOrder: 50,
    projects: ['Bruecke St. Gallen', 'Neubau Zuerich Nord', 'Sanierung Basel'],
    note: 'Framework agreement for fixings. Extra 2% from 500 EUR.',
  },
  {
    id: 'RV-2024-FI-003',
    supplier: 'Fischer',
    status: 'Active',
    signed: '15 Mar 2024',
    expires: '30 Jun 2026',
    discount: 3,
    paymentDays: 14,
    minOrder: 30,
    projects: ['Bruecke St. Gallen', 'Sanierung Basel'],
    note: 'Plastic anchors only. Lead time 2 workdays.',
  },
  {
    id: 'RV-2025-UV-001',
    supplier: 'Uvex',
    status: 'Active',
    signed: '01 Feb 2025',
    expires: '31 Dec 2026',
    discount: 7,
    paymentDays: 30,
    minOrder: 100,
    projects: ['Bruecke St. Gallen', 'Neubau Zuerich Nord', 'Sanierung Basel'],
    note: 'PPE agreement with volume pricing for helmets.',
  },
  {
    id: 'RV-2023-TE-002',
    supplier: 'Tesa',
    status: 'Expired',
    signed: '01 Apr 2023',
    expires: '31 Mar 2026',
    discount: 2,
    paymentDays: 30,
    minOrder: 20,
    projects: ['Bruecke St. Gallen'],
    note: 'Expired, renewal proposal pending.',
  },
];

const STATUS_STYLES: Record<string, string> = {
  Active: 'bg-brand-ok text-brand-text',
  Draft: 'bg-brand-card text-brand-text',
  Expired: 'bg-brand-err text-brand-surface',
};

export function ContractsPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="panel-title">Contracts</div>
            <h1 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-slate-900">
              Framework contracts
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Supplier agreements that feed the C-material catalog with contracted pricing.
            </p>
          </div>
          <button className="btn-primary">Upload price list</button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Active contracts" value="3" tone="text-brand-ok" />
        <SummaryCard label="Expired" value="1" tone="text-red-600" />
        <SummaryCard label="Draft" value="0" tone="text-brand-text" />
        <SummaryCard label="Avg. discount" value="5%" tone="text-brand" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {CONTRACTS.map((contract) => (
            <div key={contract.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="text-base font-bold text-slate-900">{contract.supplier}</div>
                <span className={`badge ${STATUS_STYLES[contract.status]}`}>
                  {contract.status}
                </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">{contract.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Expires</div>
                  <div className="text-sm font-medium text-slate-700">{contract.expires}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <ContractStat label="Discount" value={`${contract.discount}%`} tone="text-emerald-600" />
                <ContractStat label="Projects" value={String(contract.projects.length)} />
                <ContractStat label="Payment" value={`${contract.paymentDays}d`} />
                <ContractStat label="Min order" value={`EUR ${contract.minOrder}`} />
              </div>

              <div className="mt-4 rounded-[10px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
                {contract.note}
              </div>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <div className="panel-title">Contract detail</div>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Wurth · RV-2024-WR-001</h2>
          <div className="mt-5 space-y-3 text-sm text-slate-600">
            <DetailRow label="Status" value="Active" />
            <DetailRow label="Signed" value="01 Jan 2024" />
            <DetailRow label="Expires" value="31 Dec 2026" />
            <DetailRow label="Discount" value="5% off list price" />
            <DetailRow label="Payment terms" value="Net 30 days" />
            <DetailRow label="Min. order" value="EUR 50" />
          </div>

          <div className="mt-6">
            <div className="panel-title">Linked projects</div>
            <div className="mt-3 space-y-2">
              {CONTRACTS[0].projects.map((project) => (
                <div key={project} className="rounded-[10px] bg-brand-surface px-4 py-3 text-sm text-slate-700">
                  {project}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}): JSX.Element {
  return (
    <div className="card p-5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function ContractStat({
  label,
  value,
  tone = 'text-slate-900',
}: {
  label: string;
  value: string;
  tone?: string;
}): JSX.Element {
  return (
    <div className="rounded-[10px] bg-brand-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-brand-line pb-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
