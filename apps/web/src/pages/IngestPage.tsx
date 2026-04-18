import { useState } from 'react';
import axios from 'axios';
import { FileSpreadsheet, FileText, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/auth';

interface IngestResult {
  status: string;
  rows_in?: number;
  c_materials?: number;
  excluded?: number;
  excluded_samples?: Array<{ name: string; class: string }>;
  upsert_result?: { inserted: number; updated: number; rejected: number };
  mapping?: { language_detected?: string; currency_detected?: string };
}

const PREVIEW_ROWS = [
  ['C001', 'TX20 screw 4x40', 'Fasteners', 'pc', '0.08', 'Wurth'],
  ['C014', 'Cable tie 300 mm', 'Electrical', 'pc', '0.09', 'Hellermann'],
  ['C023', 'FFP2 mask', 'PPE', 'pc', '1.80', 'Draeger'],
  ['C039', 'Transparent silicone', 'Sealants', 'tube', '3.80', 'Soudal'],
  ['C084', 'Lashing strap 5 m', 'Transport', 'pc', '8.50', 'Wurth'],
];

export function IngestPage(): JSX.Element {
  const token = useAuthStore((state) => state.accessToken);
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState('11111111-1111-1111-1111-111111111111');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const visibleRows = PREVIEW_ROWS.filter((row) =>
    row.join(' ').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="panel-title">Catalog</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Import supplier catalogs into the procurement portal
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Upload CSV, Excel or PDF contract files, let AI map the messy columns,
              and keep only the small site supplies that belong in this ordering flow.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <IngestHint
                icon={<FileSpreadsheet size={18} />}
                title="Excel and CSV"
                text="Best for framework price lists with SKU, description, price, unit and packaging columns."
              />
              <IngestHint
                icon={<FileText size={18} />}
                title="PDF contracts"
                text="Useful for supplier offers and printed price sheets with imperfect structure and discounts."
              />
              <IngestHint
                icon={<Sparkles size={18} />}
                title="AI filtering"
                text="Rows that look like A-materials can be excluded before they ever reach the site catalog."
              />
            </div>
          </div>

          <div className="rounded-[14px] bg-brand-surface/70 p-5">
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Supplier ID
            </label>
            <input
              className="mt-2 w-full rounded-[12px] border border-brand-line px-4 py-3 text-sm font-mono"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            />
            <label className="mt-4 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Source file
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm"
            />
            <div className="mt-3 rounded-[12px] bg-brand-card px-4 py-3 text-sm text-slate-600">
              Keep this flow focused on consumables, site supplies, PPE, fixings,
              tapes, sealants and similar low-value items. Large engineered products
              should stay outside the C-materials catalog.
            </div>
            <button
              className="btn-primary mt-5"
              disabled={!file || busy}
              onClick={async () => {
                if (!file) return;
                setBusy(true);
                setError(null);
                setResult(null);
                try {
                  const formData = new FormData();
                  formData.append('supplier_id', supplierId);
                  formData.append('default_currency', 'CHF');
                  formData.append('file', file);
                  const response = await axios.post<IngestResult>(
                    '/api/ingest/supplier-file',
                    formData,
                    {
                      headers: { Authorization: `Bearer ${token}` },
                    },
                  );
                  setResult(response.data);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Ingest failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Processing…' : 'Upload and map catalog'}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="text-sm text-brand-err">{error}</div>}

      {result && (
        <div className="card max-w-4xl p-5">
          <h2 className="mb-3 font-semibold text-brand">Ingest result</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Rows seen" value={result.rows_in ?? 0} />
            <Stat label="C-materials" value={result.c_materials ?? 0} accent />
            <Stat label="Excluded (A/B)" value={result.excluded ?? 0} />
            <Stat label="Detected language" value={result.mapping?.language_detected ?? '-'} />
          </div>
          {result.upsert_result && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Stat label="Inserted" value={result.upsert_result.inserted} />
              <Stat label="Updated" value={result.upsert_result.updated} />
              <Stat label="Rejected" value={result.upsert_result.rejected} />
            </div>
          )}
          {result.excluded_samples && result.excluded_samples.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">
                Excluded samples (outside C-material scope)
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.excluded_samples.map((sample, index) => (
                  <li key={index}>
                    <span className="font-medium">{sample.class}</span> - {sample.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">Catalog preview</div>
            <div className="mt-1 text-sm text-slate-500">
              Example normalized records after import
            </div>
          </div>
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search catalog preview…"
              className="w-full rounded-full border border-brand-line bg-brand-card py-2 pl-10 pr-4 text-sm outline-none lg:w-72"
            />
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-brand-surface/70 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row[0]} className="border-t border-brand-line">
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className={`px-4 py-3 ${index === 0 || index === 4 ? 'font-mono' : ''}`}
                  >
                    {index === 4 ? `EUR ${cell}` : cell}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No preview items match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}): JSX.Element {
  return (
    <div
      className={`rounded-[12px] border border-brand-line p-4 ${
        accent ? 'bg-brand-accent/10' : 'bg-brand-card/70'
      }`}
    >
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function IngestHint({
  icon,
  title,
  text,
}: {
  icon: JSX.Element;
  title: string;
  text: string;
}): JSX.Element {
  return (
    <div className="rounded-[14px] border border-brand-line/80 bg-brand-card/75 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-brand text-brand-surface">
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-brand">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
