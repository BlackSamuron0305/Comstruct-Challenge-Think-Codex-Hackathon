import { useMemo } from 'react';
import { GitBranch, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useProjectContext } from '../context/ProjectContext';
import { POLICIES } from '../lib/mockData';

export function PoliciesPage(): JSX.Element {
  const { selectedProject } = useProjectContext();
  const policies = useMemo(
    () => POLICIES.filter((policy) => policy.projectId === selectedProject.id),
    [selectedProject.id],
  );

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="panel-title">Policies</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Spending rules for {selectedProject.name}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Define category-based approval logic, routing conditions and automation rules at the project level.
            </p>
          </div>
          <div className="rounded-[16px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
            {policies.length} active workflows
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {policies.map((policy) => (
            <article key={policy.id} className="rounded-[24px] border border-brand-line bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-slate-900">{policy.name}</div>
                    <span className={`badge ${policy.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-slate-900'}`}>
                      {policy.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    {policy.category} · {policy.id}
                  </div>
                </div>
                <div className="rounded-full bg-brand-surface px-3 py-2 text-xs font-semibold text-brand">
                  Conditional flow
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <PolicyInfo title="Rule" text={policy.rule} />
                <PolicyInfo title="Condition" text={policy.condition} />
                <PolicyInfo title="Route" text={policy.route} />
              </div>
            </article>
          ))}

          {policies.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-brand-line bg-brand-surface/60 px-6 py-10 text-center text-sm text-slate-500">
              No policies configured for this project yet.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-brand-line bg-white p-5">
            <div className="flex items-center gap-2 text-brand">
              <ShieldCheck size={16} />
              <div className="text-sm font-semibold">Example rule</div>
            </div>
            <div className="mt-4 text-lg font-semibold text-slate-900">
              Auto-approve up to EUR 200 for Painting category in Project X
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This is the target pattern for low-risk, repetitive requests: define category, threshold, supplier guardrails and the escalation route when conditions fail.
            </p>
          </div>

          <div className="rounded-[24px] border border-brand-line bg-white p-5">
            <div className="flex items-center gap-2 text-brand">
              <GitBranch size={16} />
              <div className="text-sm font-semibold">Approval flow logic</div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-[18px] bg-brand-surface px-4 py-3">
                1. Match category and supplier coverage.
              </div>
              <div className="rounded-[18px] bg-brand-surface px-4 py-3">
                2. Check amount threshold and live budget status.
              </div>
              <div className="rounded-[18px] bg-brand-surface px-4 py-3">
                3. Route to project manager or procurement only when the guardrails break.
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-brand-line bg-white p-5">
            <div className="flex items-center gap-2 text-brand">
              <SlidersHorizontal size={16} />
              <div className="text-sm font-semibold">Design intent</div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Policies stay project-specific so small routine requests move fast while exceptions still receive contextual review.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PolicyInfo({ title, text }: { title: string; text: string }): JSX.Element {
  return (
    <div className="rounded-[18px] bg-brand-surface px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-900">{text}</div>
    </div>
  );
}
