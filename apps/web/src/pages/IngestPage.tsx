import { useState } from 'react';
import axios from 'axios';
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

export function IngestPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState('11111111-1111-1111-1111-111111111111');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Supplier catalog ingest</h1>

      <div className="card p-5 max-w-xl">
        <label className="text-sm font-medium">Supplier ID</label>
        <input
          className="mt-1 mb-4 w-full rounded-md border border-brand-line px-3 py-2 text-sm font-mono"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        />
        <label className="text-sm font-medium">CSV / XLSX / PDF file</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 mb-4 block text-sm"
        />
        <button
          className="btn-primary"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            setError(null);
            setResult(null);
            try {
              const fd = new FormData();
              fd.append('supplier_id', supplierId);
              fd.append('default_currency', 'CHF');
              fd.append('file', file);
              const r = await axios.post<IngestResult>('/api/ingest/supplier-file', fd, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setResult(r.data);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Ingest failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Processing…' : 'Upload & ingest'}
        </button>
      </div>

      {error && <div className="mt-4 text-sm text-brand-err">{error}</div>}

      {result && (
        <div className="mt-5 card p-5 max-w-2xl">
          <h2 className="font-semibold mb-3">Ingest result</h2>
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
              <summary className="cursor-pointer font-medium">Excluded samples (non-C)</summary>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {result.excluded_samples.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.class}</span> — {s.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }): JSX.Element {
  return (
    <div className={`rounded-md border border-brand-line p-3 ${accent ? 'bg-brand-accent/10' : ''}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
