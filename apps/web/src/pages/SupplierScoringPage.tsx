import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
  Globe,
  Puzzle,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatMoney } from '../lib/procurement';

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

interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResponse {
  query: string;
  results: WebSearchHit[];
  count: number;
}

interface ScoreDimension {
  value: string;
  sample_size: number;
}

interface ScoreBreakdown {
  supplier_id: string;
  scores: Record<string, ScoreDimension>;
  weights: Record<string, number>;
  sample_size: number;
  computed_at: string | null;
}

export function SupplierScoringPage(): JSX.Element {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

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

  const supplierSearch = useMutation({
    mutationFn: async (query: string) => {
      const response = await api.post<WebSearchResponse>('/api/supplier-scoring/web-search', {
        query,
        num_results: 6,
      });
      return response.data;
    },
  });

  const breakdown = useQuery<ScoreBreakdown>({
    queryKey: ['score-breakdown', expandedSupplier],
    queryFn: async () =>
      (await api.get(`/api/supplier-scoring/${expandedSupplier}/score-breakdown`)).data,
    enabled: !!expandedSupplier,
    retry: false,
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

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-brand" />
          <h2 className="text-base font-semibold text-slate-900">Search suppliers on the web</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Research supplier websites and market results for a product or category.
        </p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Search query
            </label>
            <input
              className="mt-2 w-full rounded-[12px] border border-brand-line px-4 py-3 text-sm"
              placeholder="Example: cable ties supplier Switzerland"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!searchQuery.trim() || supplierSearch.isPending}
            onClick={() => supplierSearch.mutate(searchQuery.trim())}
          >
            {supplierSearch.isPending ? 'Searching…' : 'Search web'}
          </button>
        </div>

        {supplierSearch.data && (
          <div className="mt-5 space-y-3">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
              {supplierSearch.data.count} results
            </div>
            {supplierSearch.data.results.map((result) => (
              <div key={result.url} className="rounded-[12px] border border-brand-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{result.title}</div>
                    <div className="mt-1 text-xs text-slate-500 break-all">{result.url}</div>
                  </div>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-xs"
                  >
                    <ExternalLink size={14} /> Open
                  </a>
                </div>
                {result.snippet && (
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.snippet}</p>
                )}
              </div>
            ))}
            {supplierSearch.data.results.length === 0 && (
              <div className="text-sm text-slate-500">No results were found for this search.</div>
            )}
          </div>
        )}

        {supplierSearch.isError && (
          <div className="mt-4 text-sm text-brand-err">Supplier web search failed.</div>
        )}
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
                <SupplierRow
                  key={comparisonItem.supplier_id}
                  item={comparisonItem}
                  isRecommended={comparisonItem.supplier_id === comparison.data.recommendation}
                  isExpanded={expandedSupplier === comparisonItem.supplier_id}
                  breakdown={expandedSupplier === comparisonItem.supplier_id ? breakdown.data : undefined}
                  breakdownLoading={expandedSupplier === comparisonItem.supplier_id && breakdown.isLoading}
                  onToggle={() =>
                    setExpandedSupplier(
                      expandedSupplier === comparisonItem.supplier_id ? null : comparisonItem.supplier_id,
                    )
                  }
                  onRecompute={() => recompute.mutate(comparisonItem.supplier_id)}
                  recomputePending={recompute.isPending}
                />
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

const SCORE_LABELS: Record<string, { label: string; icon: typeof Wallet }> = {
  price: { label: 'Price competitiveness', icon: Wallet },
  delivery: { label: 'Delivery reliability', icon: Truck },
  trust: { label: 'Trust & track record', icon: Shield },
  quality_web: { label: 'Web reputation', icon: Globe },
  specs_fit: { label: 'Specs fit (AI)', icon: Puzzle },
};

function ScoreBar({ label, value, weight, icon: Icon }: {
  label: string;
  value: number;
  weight: number;
  icon: typeof Wallet;
}): JSX.Element {
  const barColor =
    value >= 75 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <Icon size={13} className="text-slate-400" />
          {label}
        </span>
        <span className="font-mono text-slate-500">
          {value.toFixed(1)} <span className="text-slate-400">({(weight * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function SupplierRow({
  item,
  isRecommended,
  isExpanded,
  breakdown,
  breakdownLoading,
  onToggle,
  onRecompute,
  recomputePending,
}: {
  item: Comparison;
  isRecommended: boolean;
  isExpanded: boolean;
  breakdown?: ScoreBreakdown;
  breakdownLoading: boolean;
  onToggle: () => void;
  onRecompute: () => void;
  recomputePending: boolean;
}): JSX.Element {
  const Chevron = isExpanded ? ChevronUp : ChevronDown;

  return (
    <>
      <tr
        className={`border-t border-brand-line cursor-pointer hover:bg-slate-50 ${
          isRecommended ? 'bg-brand/15' : ''
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Chevron size={14} className="text-slate-400" />
            {item.supplier_id.slice(0, 8)}
          </span>
          {isRecommended && (
            <span className="ml-2 badge bg-brand-ok text-brand-text">
              <ShieldCheck size={12} /> Recommended
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-mono">
          {formatMoney(item.unit_price, item.currency)}
        </td>
        <td className="px-4 py-3">
          <ScoreBadge score={item.overall_score} />
        </td>
        <td className="px-4 py-3 font-mono">
          {item.composite_rank?.toFixed(1) ?? '-'}
        </td>
        <td className="px-4 py-3">
          <button
            className="btn-ghost text-xs"
            onClick={(e) => { e.stopPropagation(); onRecompute(); }}
            disabled={recomputePending}
          >
            <RefreshCw size={14} /> Recompute
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-t border-brand-line/50">
          <td colSpan={5} className="px-4 py-5 bg-slate-50/80">
            {breakdownLoading && (
              <div className="text-sm text-slate-500 animate-pulse">Loading score breakdown…</div>
            )}
            {breakdown && Object.keys(breakdown.scores).length > 0 && (
              <div className="max-w-xl space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Score breakdown
                </div>
                {Object.entries(SCORE_LABELS).map(([key, meta]) => {
                  const dim = breakdown.scores[key];
                  if (!dim) return null;
                  return (
                    <ScoreBar
                      key={key}
                      label={meta.label}
                      value={Number(dim.value)}
                      weight={breakdown.weights[key] ?? 0}
                      icon={meta.icon}
                    />
                  );
                })}
                {breakdown.scores.overall && (
                  <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-brand-line bg-white px-4 py-3">
                    <BarChart3 size={16} className="text-brand" />
                    <span className="text-sm font-semibold text-slate-900">
                      Overall: {Number(breakdown.scores.overall.value).toFixed(1)} / 100
                    </span>
                    {breakdown.computed_at && (
                      <span className="ml-auto text-xs text-slate-400">
                        Computed {new Date(breakdown.computed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {breakdown && Object.keys(breakdown.scores).length === 0 && (
              <div className="text-sm text-slate-500">
                No scores computed yet. Click <strong>Recompute</strong> to generate scores.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
