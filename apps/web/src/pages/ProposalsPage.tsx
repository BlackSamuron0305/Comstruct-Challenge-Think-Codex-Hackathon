import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  HandshakeIcon,
  Loader2,
  Search,
  Star,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface ProposedSupplier {
  name: string;
  url: string;
  snippet: string;
  reputation_score: number;
  positive_signals: number;
  negative_signals: number;
}

interface Proposal {
  proposal_id: string;
  product_query: string;
  status: string;
  supplier_count: number;
  created_at: string;
}

interface ProposalDetail {
  proposal_id: string;
  company_id: string;
  product_query: string;
  status: string;
  proposed_suppliers: ProposedSupplier[];
  web_search_summary: string;
  recommended_supplier_id: string | null;
  approved_supplier_id: string | null;
  created_at: string;
}

interface CreateProposalResult {
  proposal_id: string;
  status: string;
  product_query: string;
  category: string | null;
  supplier_count: number;
  recommended: ProposedSupplier | null;
  all_suppliers: ProposedSupplier[];
  summary: string;
}

export function ProposalsPage(): JSX.Element {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const companyId = user?.company_id ?? '';

  const [productQuery, setProductQuery] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const proposals = useQuery<Proposal[]>({
    queryKey: ['proposals', companyId],
    queryFn: async () =>
      (await api.get(`/api/supplier-scoring/proposals/by-company/${companyId}`)).data,
    enabled: !!companyId,
  });

  const detail = useQuery<ProposalDetail>({
    queryKey: ['proposal-detail', selectedId],
    queryFn: async () =>
      (await api.get(`/api/supplier-scoring/proposals/${selectedId}`)).data,
    enabled: !!selectedId,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post<CreateProposalResult>('/api/supplier-scoring/proposals', {
        company_id: companyId,
        product_query: productQuery.trim(),
        category: category.trim() || null,
      });
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setSelectedId(data.proposal_id);
      setProductQuery('');
      setCategory('');
    },
  });

  const approve = useMutation({
    mutationFn: async ({ proposalId, supplierIndex }: { proposalId: string; supplierIndex: number }) => {
      const res = await api.post(`/api/supplier-scoring/proposals/${proposalId}/approve`, {
        supplier_index: supplierIndex,
        approved_by: user?.id ?? '',
        notes: 'Approved via web UI',
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-detail'] });
    },
  });

  const reject = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await api.post(`/api/supplier-scoring/proposals/${proposalId}/reject`, {
        rejected_by: user?.id ?? '',
        reason: 'Rejected via web UI',
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-detail'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="card p-6 lg:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand text-brand-surface">
            <HandshakeIcon size={22} />
          </div>
          <div>
            <div className="panel-title">Supplier proposals</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              AI-powered supplier discovery
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Search the web for potential suppliers, score them by reputation,
              and approve the best fit for your preferred supplier list.
            </p>
          </div>
        </div>
      </section>

      {/* Create proposal */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Create new proposal</h2>
        <p className="mt-1 text-sm text-slate-500">
          Describe what you need and the AI will find and rank potential suppliers.
        </p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Product / material
            </label>
            <input
              className="mt-2 w-full rounded-[12px] border border-brand-line px-4 py-3 text-sm"
              placeholder="e.g. concrete anchors M12"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
          </div>
          <div className="w-48">
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Category
            </label>
            <input
              className="mt-2 w-full rounded-[12px] border border-brand-line px-4 py-3 text-sm"
              placeholder="e.g. Fasteners"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!productQuery.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search size={14} /> Find suppliers
              </>
            )}
          </button>
        </div>
        {create.isError && (
          <div className="mt-3 text-sm text-brand-err">
            Failed to create proposal. Try again.
          </div>
        )}
      </section>

      {/* Proposals list + detail */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left: list */}
        <section className="card overflow-hidden">
          <div className="border-b border-brand-line px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Your proposals</h2>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {proposals.data?.map((p) => (
              <button
                key={p.proposal_id}
                className={`w-full border-b border-brand-line/50 px-5 py-4 text-left transition hover:bg-slate-50 ${
                  selectedId === p.proposal_id ? 'bg-brand/10' : ''
                }`}
                onClick={() => setSelectedId(p.proposal_id)}
              >
                <div className="text-sm font-semibold text-slate-900">{p.product_query}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={p.status} />
                  <span>{p.supplier_count} suppliers</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
            {proposals.data?.length === 0 && (
              <div className="p-5 text-sm text-slate-500">
                No proposals yet. Create one above.
              </div>
            )}
          </div>
        </section>

        {/* Right: detail */}
        <section className="card overflow-hidden">
          {!selectedId && (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              Select a proposal to view details
            </div>
          )}
          {selectedId && detail.isLoading && (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {detail.data && (
            <div>
              <div className="border-b border-brand-line px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {detail.data.product_query}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <StatusBadge status={detail.data.status} />
                      <span>
                        Created {new Date(detail.data.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {detail.data.status === 'pending' && (
                    <button
                      className="btn-ghost text-xs text-brand-err"
                      onClick={() => reject.mutate(detail.data!.proposal_id)}
                      disabled={reject.isPending}
                    >
                      <XCircle size={14} /> Reject all
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 p-5">
                {detail.data.proposed_suppliers.map((s, i) => (
                  <div
                    key={s.url}
                    className={`rounded-[12px] border p-4 ${
                      i === 0 ? 'border-brand bg-brand/5' : 'border-brand-line'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {i === 0 && <Star size={14} className="text-amber-500 fill-amber-500" />}
                          <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 break-all">{s.url}</div>
                        {s.snippet && (
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {s.snippet.slice(0, 200)}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                          <span className="font-mono">
                            Reputation: <strong className={s.reputation_score >= 60 ? 'text-emerald-600' : 'text-amber-600'}>
                              {s.reputation_score}/100
                            </strong>
                          </span>
                          <span className="text-emerald-600">+{s.positive_signals} positive</span>
                          <span className="text-rose-500">-{s.negative_signals} negative</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost text-xs"
                        >
                          <ExternalLink size={14} />
                        </a>
                        {detail.data!.status === 'pending' && (
                          <button
                            className="btn-primary text-xs"
                            onClick={() =>
                              approve.mutate({
                                proposalId: detail.data!.proposal_id,
                                supplierIndex: i,
                              })
                            }
                            disabled={approve.isPending}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {detail.data.proposed_suppliers.length === 0 && (
                  <div className="text-sm text-slate-500">No suppliers found in this proposal.</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`badge text-[10px] ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
