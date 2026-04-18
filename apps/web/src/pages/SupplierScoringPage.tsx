import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BarChart3, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';

interface Comparison {
  supplier_id: string;
  unit_price: string;
  currency: string;
  overall_score: string | null;
  composite_rank?: number;
}

interface ComparisonResult {
  product_id: string;
  comparisons: Comparison[];
  recommendation: string | null;
}

export function SupplierScoringPage(): JSX.Element {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');

  const comparison = useQuery<ComparisonResult>({
    queryKey: ['supplier-compare', productId],
    queryFn: async () =>
      (await api.get(`/api/supplier-scoring/compare?product_id=${productId}`)).data,
    enabled: !!productId && productId.length === 36,
    retry: false,
  });

  const recompute = useMutation({
    mutationFn: (supplierId: string) =>
      api.post(`/api/supplier-scoring/${supplierId}/compute-score`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-compare'] }),
  });

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand text-brand-surface">
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="panel-title">Supplier scoring</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Compare supplier fit before ordering
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Review unit price and computed performance score side by side to support
              better sourcing decisions for catalog items.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Compare suppliers by product</h2>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Product ID
            </label>
            <input
              className="mt-2 w-full rounded-[12px] border border-brand-line px-4 py-3 text-sm font-mono"
              placeholder="Enter product UUID"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!productId || productId.length !== 36}
            onClick={() => qc.invalidateQueries({ queryKey: ['supplier-compare'] })}
          >
            Compare
          </button>
        </div>
      </section>

      {comparison.data && (
        <div className="card overflow-hidden">
          <div className="border-b border-brand-line px-6 py-5">
            <div className="text-base font-semibold text-slate-900">Comparison results</div>
            <div className="mt-1 text-sm text-slate-500">
              Ranked supplier options for the selected catalog product
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-brand-surface text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Overall score</th>
                <th className="px-4 py-3">Composite rank</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {comparison.data.comparisons.map((comparisonItem) => (
                <tr
                  key={comparisonItem.supplier_id}
                  className={`border-t border-brand-line ${
                    comparisonItem.supplier_id === comparison.data.recommendation
                    ? 'bg-brand/15'
                      : ''
                    }`}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {comparisonItem.supplier_id.slice(0, 8)}
                    {comparisonItem.supplier_id === comparison.data.recommendation && (
                      <span className="ml-2 badge bg-brand-ok text-brand-text">
                        Recommended
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {Number(comparisonItem.unit_price).toFixed(2)} {comparisonItem.currency}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={comparisonItem.overall_score} />
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {comparisonItem.composite_rank?.toFixed(1) ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => recompute.mutate(comparisonItem.supplier_id)}
                      disabled={recompute.isPending}
                    >
                      <RefreshCw size={14} /> Recompute
                    </button>
                  </td>
                </tr>
              ))}
              {comparison.data.comparisons.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No supplier data for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {comparison.isError && (
        <div className="text-sm text-brand-err">Failed to load comparison data.</div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: string | null }): JSX.Element {
  if (!score) return <span className="text-slate-400">—</span>;

  const numeric = Number(score);
  const color =
    numeric >= 75
      ? 'text-brand-text bg-brand-ok'
      : numeric >= 50
        ? 'text-brand-text bg-brand-accent'
        : 'text-brand-surface bg-brand-err';
  const Icon = numeric >= 60 ? TrendingUp : numeric >= 40 ? Minus : TrendingDown;

  return (
    <span className={`badge inline-flex items-center gap-1 ${color}`}>
      <Icon size={12} />
      {numeric.toFixed(1)}
    </span>
  );
}
