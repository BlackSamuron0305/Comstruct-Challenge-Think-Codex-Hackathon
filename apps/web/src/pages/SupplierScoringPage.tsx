import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '../lib/api';

interface SupplierScore {
  supplier_id: string;
  score_type: string;
  score_value: string;
  sample_size: number;
  computed_at: string;
}

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
    <div>
      <div className="flex items-center gap-3 mb-5">
        <BarChart3 size={24} className="text-brand" />
        <h1 className="text-2xl font-bold">Supplier Scoring</h1>
      </div>

      {/* Comparison tool */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold mb-3">Compare Suppliers by Product</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600">Product ID</label>
            <input
              className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm font-mono"
              placeholder="Enter product UUID"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
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
      </div>

      {/* Results table */}
      {comparison.data && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left bg-brand-surface text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Overall Score</th>
                <th className="px-4 py-3">Composite Rank</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {comparison.data.comparisons.map((c, i) => (
                <tr
                  key={c.supplier_id}
                  className={`border-t border-brand-line ${
                    c.supplier_id === comparison.data?.recommendation
                      ? 'bg-emerald-50'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {c.supplier_id.slice(0, 8)}
                    {c.supplier_id === comparison.data?.recommendation && (
                      <span className="ml-2 badge bg-emerald-100 text-emerald-800">
                        Recommended
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {Number(c.unit_price).toFixed(2)} {c.currency}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={c.overall_score} />
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {c.composite_rank?.toFixed(1) ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => recompute.mutate(c.supplier_id)}
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
        <div className="text-sm text-brand-err mt-2">
          Failed to load comparison data.
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: string | null }): JSX.Element {
  if (!score) return <span className="text-slate-400">—</span>;
  const val = Number(score);
  const color =
    val >= 75
      ? 'text-emerald-700 bg-emerald-100'
      : val >= 50
        ? 'text-amber-700 bg-amber-100'
        : 'text-red-700 bg-red-100';
  const Icon = val >= 60 ? TrendingUp : val >= 40 ? Minus : TrendingDown;
  return (
    <span className={`badge ${color} inline-flex items-center gap-1`}>
      <Icon size={12} />
      {val.toFixed(1)}
    </span>
  );
}
