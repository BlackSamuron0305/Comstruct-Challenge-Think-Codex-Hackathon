import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Clock3, SlidersHorizontal, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { formatDate, formatMoney } from '../lib/procurement';

const INITIAL_THRESHOLDS = [
  { project: 'Bruecke St. Gallen', autoApprove: 200, dailyCap: 5000 },
  { project: 'Neubau Zuerich Nord', autoApprove: 150, dailyCap: 3500 },
  { project: 'Sanierung Basel', autoApprove: 300, dailyCap: 6000 },
];

const CATEGORY_RULES = [
  { category: 'Fasteners', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'PPE', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'Tools', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'Building materials', blocked: true, reason: 'Use A-material process' },
  { category: 'Machinery', blocked: true, reason: 'Use A-material process' },
];

type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

type ApprovalRequest = {
  id: string;
  project: string;
  requester: string;
  amount: number;
  currency: string;
  category: string;
  submittedAt: string;
  justification: string;
  status: ApprovalRequestStatus;
};

const INITIAL_APPROVAL_QUEUE: ApprovalRequest[] = [
  {
    id: 'APR-1042',
    project: 'Bruecke St. Gallen',
    requester: 'Foreman Matteo R.',
    amount: 184.5,
    currency: 'EUR',
    category: 'Fasteners',
    submittedAt: '2026-04-18T08:25:00.000Z',
    justification: 'Anchor bolts and drill bits needed before afternoon pier reinforcement starts.',
    status: 'pending',
  },
  {
    id: 'APR-1043',
    project: 'Neubau Zuerich Nord',
    requester: 'Foreman Nora S.',
    amount: 198.9,
    currency: 'EUR',
    category: 'PPE',
    submittedAt: '2026-04-17T13:30:00.000Z',
    justification: 'Facade access team needs replacement PPE for the next shift handover.',
    status: 'pending',
  },
  {
    id: 'APR-1040',
    project: 'Sanierung Basel',
    requester: 'Foreman Lars B.',
    amount: 246,
    currency: 'EUR',
    category: 'Tools',
    submittedAt: '2026-04-15T14:20:00.000Z',
    justification: 'Urgent tooling request exceeded the site threshold and was escalated for review.',
    status: 'rejected',
  },
  {
    id: 'APR-1041',
    project: 'Neubau Zuerich Nord',
    requester: 'Foreman Elena P.',
    amount: 126.4,
    currency: 'EUR',
    category: 'Electrical',
    submittedAt: '2026-04-18T09:15:00.000Z',
    justification: 'Cable fixings and boxes approved after lead confirmed level 2 installation plan.',
    status: 'approved',
  },
];

export function ApprovalsPage(): JSX.Element {
  const qc = useQueryClient();
  const [projectThresholds, setProjectThresholds] = useState(INITIAL_THRESHOLDS);
  const [approvalQueue, setApprovalQueue] = useState(INITIAL_APPROVAL_QUEUE);
  const [selectedProject, setSelectedProject] = useState(INITIAL_THRESHOLDS[0]?.project ?? '');
  const [thresholdsSaved, setThresholdsSaved] = useState(false);

  const updateProjectThreshold = (
    field: 'autoApprove' | 'dailyCap',
    value: string,
  ) => {
    setProjectThresholds((current) =>
      current.map((entry) =>
        entry.project === selectedProject
          ? {
              ...entry,
              [field]: Number(value),
            }
          : entry,
      ),
    );
  };

  const activeProjectThreshold =
    projectThresholds.find((threshold) => threshold.project === selectedProject) ??
    projectThresholds[0];
  const pendingRequests = useMemo(
    () =>
      approvalQueue
        .filter((request) => request.status === 'pending')
        .sort((left, right) => +new Date(left.submittedAt) - +new Date(right.submittedAt)),
    [approvalQueue],
  );
  const processedRequests = useMemo(
    () =>
      approvalQueue
        .filter((request) => request.status !== 'pending')
        .sort((left, right) => +new Date(right.submittedAt) - +new Date(left.submittedAt))
        .slice(0, 4),
    [approvalQueue],
  );
  const pendingValue = pendingRequests.reduce((sum, request) => sum + request.amount, 0);
  const oldestPendingRequest = pendingRequests[0];

  const updateApprovalStatus = (requestId: string, status: ApprovalRequestStatus) => {
    setApprovalQueue((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
            }
          : request,
      ),
    );
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  return (
    <div className="space-y-6">
      <section className="card border-2 border-brand p-6 lg:p-8">
        <div className="inline-flex items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Approval desk
        </div>
        <h1 className="mt-4 text-3xl font-bold text-brand">
          Control spend without slowing down the site.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
          Configure project-specific approval limits alongside category rules.
        </p>
      </section>

      <section className="card border-2 border-brand overflow-hidden">
        <div className="border-b border-brand/40 px-6 py-5">
          <div className="panel-title">Manual approval queue</div>
          <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-slate-900">
            Review requests that need a manager decision
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Pending requests stay here until someone approves or rejects them manually.
          </p>
        </div>

        <div className="grid gap-4 border-b border-brand/40 px-6 py-5 md:grid-cols-3">
          <QueueStat
            icon={<Clock3 size={18} />}
            label="Pending requests"
            value={String(pendingRequests.length)}
            tone="amber"
          />
          <QueueStat
            icon={<CheckCircle2 size={18} />}
            label="Pending value"
            value={formatMoney(pendingValue, 'EUR')}
            tone="green"
          />
          <QueueStat
            icon={<XCircle size={18} />}
            label="Oldest request"
            value={oldestPendingRequest ? formatDate(oldestPendingRequest.submittedAt) : 'Queue empty'}
            tone="slate"
          />
        </div>

        <div className="px-6 py-5">
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-[24px] border-2 border-brand bg-brand-card p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-brand-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-text">
                        {request.id}
                      </span>
                      <span className="rounded-full bg-brand-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {request.category}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{request.project}</h3>
                    <div className="mt-2 text-sm text-slate-500">
                      {request.requester} · Submitted {formatDate(request.submittedAt)}
                    </div>
                    <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
                      {request.justification}
                    </p>
                  </div>

                  <div className="min-w-[220px] rounded-[20px] border-2 border-brand/30 bg-brand-surface/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Requested amount
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-900">
                      {formatMoney(request.amount, request.currency)}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        className="flex-1 rounded-[16px]"
                        onClick={() => updateApprovalStatus(request.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 rounded-[16px] border-brand-err/20 text-brand-err hover:border-brand-err/50"
                        onClick={() => updateApprovalStatus(request.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {pendingRequests.length === 0 && (
              <div className="rounded-[24px] border-2 border-dashed border-brand bg-brand-surface/50 px-6 py-10 text-center text-sm text-slate-500">
                No requests are waiting for manual approval right now.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-brand/40 px-6 py-5">
          <div className="text-base font-semibold text-slate-900">Recent decisions</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {processedRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-[18px] border-2 border-brand/40 bg-brand-surface/70 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{request.project}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {request.id} · {request.requester}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'badge',
                      request.status === 'approved'
                        ? 'bg-brand-ok text-brand-text'
                        : 'bg-brand-err text-brand-surface',
                    )}
                  >
                    {request.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">{formatDate(request.submittedAt)}</span>
                  <span className="font-mono text-slate-900">
                    {formatMoney(request.amount, request.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card border-2 border-brand overflow-hidden">
        <div className="border-b border-brand/40 px-6 py-5">
          <div className="panel-title">Approval rules</div>
          <h2 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-slate-900">
            Configure approval limits per project
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Set the project-specific limits used for automatic approval and daily foreman spending.
          </p>
        </div>
        <div className="p-6">
          <div className="rounded-[28px] border-2 border-brand/40 bg-brand-surface/70 p-5">
            <div className="flex items-center gap-2 text-brand">
              <SlidersHorizontal size={18} />
              <div className="panel-title !text-brand/70">Project limits</div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
              <div>
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Project
                </label>
                <div className="mt-2">
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="rounded-[14px] bg-white px-4 py-3 shadow-none">
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectThresholds.map((threshold) => (
                        <SelectItem key={threshold.project} value={threshold.project}>
                          {threshold.project}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {activeProjectThreshold && (
                <div className="grid gap-4 md:grid-cols-2">
                  <SettingInput
                    label="Per-order auto-approve limit"
                    value={String(activeProjectThreshold.autoApprove)}
                    onChange={(value) => updateProjectThreshold('autoApprove', value)}
                  />
                  <SettingInput
                    label="Daily cap per foreman"
                    value={String(activeProjectThreshold.dailyCap)}
                    onChange={(value) => updateProjectThreshold('dailyCap', value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-brand/40 px-6 py-5">
          <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
            {projectThresholds.map((threshold) => (
              <div
                key={threshold.project}
                className={clsx(
                  'rounded-[14px] border px-4 py-3 transition',
                  threshold.project === selectedProject
                    ? 'border-2 border-brand bg-brand-card'
                    : 'border-2 border-brand/40 bg-brand-card/60',
                )}
              >
                <div className="font-medium text-slate-900">{threshold.project}</div>
                <div className="mt-2">
                  Per-order {formatMoney(threshold.autoApprove, 'EUR')}
                </div>
                <div className="mt-1">
                  Daily cap {formatMoney(threshold.dailyCap, 'EUR')}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-5">
          <button
            className="btn-primary"
            onClick={() => {
              setThresholdsSaved(true);
              window.setTimeout(() => setThresholdsSaved(false), 1800);
              qc.invalidateQueries({ queryKey: ['orders'] });
            }}
          >
            Save thresholds
          </button>
          {thresholdsSaved && <span className="text-sm font-semibold text-brand-ok">Saved</span>}
        </div>
      </section>

      <section className="card border-2 border-brand overflow-hidden">
        <div className="border-b border-brand/40 px-6 py-5">
          <div className="text-base font-semibold text-slate-900">Category rules</div>
          <div className="mt-1 text-sm text-slate-500">
            Block categories that should stay in the A-material or specialist procurement process.
          </div>
        </div>
        <div className="px-6 py-3">
          {CATEGORY_RULES.map((rule) => (
            <div
              key={rule.category}
              className="flex items-center gap-4 border-b border-brand/40 py-4 last:border-b-0"
            >
              <div
                className={`h-3.5 w-3.5 rounded-sm ${
                  rule.blocked ? 'bg-brand-err' : 'bg-brand-ok'
                }`}
              />
              <div className="flex-1 text-sm font-medium text-slate-900">{rule.category}</div>
              <div
                className={`text-sm ${
                  rule.blocked ? 'text-brand-err' : 'text-brand-ok'
                }`}
              >
                {rule.blocked ? `Blocked - ${rule.reason}` : `Allowed - ${rule.reason}`}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QueueStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  tone: 'amber' | 'green' | 'slate';
}): JSX.Element {
  const toneClasses: Record<typeof tone, string> = {
    amber: 'bg-brand-accent/40 text-brand',
    green: 'bg-brand-ok/20 text-brand-ok',
    slate: 'bg-brand-surface text-slate-600',
  };

  return (
    <div className="rounded-[22px] border-2 border-brand/40 bg-brand-card p-4">
      <div className={clsx('inline-flex rounded-2xl p-2', toneClasses[tone])}>{icon}</div>
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-900">{value}</div>
    </div>
  );
}

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[10px] border border-brand-line bg-brand-card px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}
