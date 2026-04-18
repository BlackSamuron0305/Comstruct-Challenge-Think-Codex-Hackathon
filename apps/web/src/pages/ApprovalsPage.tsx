import { useMemo, useState } from 'react';
import { CheckCircle2, Sparkles, Truck, User2, X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/ui/button';
import { useProjectContext } from '../context/ProjectContext';
import { APPROVAL_REQUESTS, type ApprovalDecision } from '../lib/mockData';
import { formatDate, formatMoney } from '../lib/procurement';

type ConfirmationState = {
  action: ApprovalDecision;
  reasoning: string;
};

export function ApprovalsPage(): JSX.Element {
  const { selectedProject } = useProjectContext();
  const [requests, setRequests] = useState(APPROVAL_REQUESTS);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  const visibleRequests = useMemo(
    () =>
      requests
        .filter((request) => request.projectId === selectedProject.id)
        .sort((left, right) => +new Date(right.submittedAt) - +new Date(left.submittedAt)),
    [requests, selectedProject.id],
  );

  const selectedRequest =
    visibleRequests.find((request) => request.id === selectedRequestId) ?? null;
  const pendingCount = visibleRequests.filter((request) => request.status === 'pending').length;

  function closeDetail(): void {
    setSelectedRequestId(null);
    setConfirmation(null);
  }

  function confirmDecision(): void {
    if (!selectedRequest || !confirmation) return;
    setRequests((current) =>
      current.map((request) =>
        request.id === selectedRequest.id
          ? {
              ...request,
              status: confirmation.action === 'approve' ? 'approved' : 'rejected',
            }
          : request,
      ),
    );
    closeDetail();
  }

  return (
    <div className="space-y-6">
      <section className="card p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="panel-title">Approvals</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-slate-900">
              Review requests for {selectedProject.name}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Open a request to inspect requester, supplier fit, AI guidance and decision context before approving.
            </p>
          </div>
          <div className="rounded-[16px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
            {pendingCount} waiting for action
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-brand-line px-6 py-5">
          <div className="text-base font-semibold text-slate-900">Request queue</div>
          <div className="mt-1 text-sm text-slate-500">
            Decisions happen inside the detail view so the reasoning stays attached to the request.
          </div>
        </div>

        <div className="divide-y divide-brand-line/70">
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => {
                setSelectedRequestId(request.id);
                setConfirmation(null);
              }}
              className="flex w-full flex-col gap-4 px-6 py-5 text-left transition hover:bg-brand-surface/45 lg:flex-row lg:items-center"
            >
              <div className="min-w-[132px]">
                <div className="font-mono text-xs font-semibold text-brand">{request.id}</div>
                <div className="mt-2 text-xs text-slate-500">{formatDate(request.submittedAt)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-slate-900">{request.item.title}</div>
                  <span className="badge bg-brand-surface text-slate-600">{request.item.category}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {request.requester.name} · {request.requester.team}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 lg:min-w-[210px] lg:justify-end">
                <div className="text-sm font-semibold text-slate-900">
                  {formatMoney(request.item.amount, request.item.currency)}
                </div>
                <span
                  className={clsx(
                    'badge',
                    request.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : request.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-slate-900',
                  )}
                >
                  {request.status}
                </span>
              </div>
            </button>
          ))}

          {visibleRequests.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No approval requests for the selected project.
            </div>
          )}
        </div>
      </section>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-950/25 p-3 lg:p-6">
          <div className="h-full w-full max-w-3xl overflow-hidden rounded-[28px] border border-brand-line bg-[color:rgba(240,242,242,0.98)] shadow-[0_30px_100px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between border-b border-brand-line px-6 py-5">
              <div>
                <div className="panel-title">Approval detail</div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {selectedRequest.item.title}
                </h2>
                <div className="mt-1 text-sm text-slate-500">
                  {selectedRequest.id} · {selectedProject.name}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full border border-brand-line bg-white p-2 text-slate-600 transition hover:border-brand/40 hover:text-brand"
                aria-label="Close approval detail"
              >
                <X size={16} />
              </button>
            </div>

            <div className="h-[calc(100%-5.5rem)] overflow-y-auto px-6 py-6">
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-6">
                  <DetailCard
                    icon={<User2 size={16} />}
                    title="Requester info"
                    rows={[
                      ['Requested by', selectedRequest.requester.name],
                      ['Role', selectedRequest.requester.role],
                      ['Team', selectedRequest.requester.team],
                      ['Submitted', formatDate(selectedRequest.submittedAt)],
                    ]}
                  />

                  <DetailCard
                    icon={<Truck size={16} />}
                    title="Item details"
                    rows={[
                      ['Category', selectedRequest.item.category],
                      ['Quantity', selectedRequest.item.quantity],
                      ['Need by', selectedRequest.item.needBy],
                      ['Amount', formatMoney(selectedRequest.item.amount, selectedRequest.item.currency)],
                    ]}
                  >
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {selectedRequest.item.justification}
                    </p>
                  </DetailCard>

                  <DetailCard
                    icon={<CheckCircle2 size={16} />}
                    title="Supplier info"
                    rows={[
                      ['Supplier', selectedRequest.supplier.name],
                      ['Lead time', selectedRequest.supplier.leadTime],
                      ['Contract', selectedRequest.supplier.contractStatus],
                      ['Supplier score', `${selectedRequest.supplier.score}/100`],
                    ]}
                  />
                </div>

                <div className="space-y-6">
                  <div className="rounded-[24px] border border-brand-line bg-white p-5">
                    <div className="flex items-center gap-2 text-brand">
                      <Sparkles size={16} />
                      <div className="text-sm font-semibold">AI recommendations</div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {selectedRequest.ai.summary}
                    </p>
                    <div className="mt-4 rounded-[18px] bg-brand-surface px-4 py-4 text-sm font-medium text-slate-900">
                      {selectedRequest.ai.recommendedAction}
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedRequest.ai.alternatives.map((alternative) => (
                        <div key={alternative.supplier} className="rounded-[18px] border border-brand-line bg-brand-card/45 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-slate-900">{alternative.supplier}</div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatMoney(alternative.price, selectedRequest.item.currency)}
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-slate-600">{alternative.reason}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            Supplier score {alternative.score}/100
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-brand-line bg-white p-5">
                    <div className="text-base font-semibold text-slate-900">Decision</div>
                    <div className="mt-2 text-sm text-slate-500">
                      Who requested? What is being requested? Does approval make sense for the current project context?
                    </div>

                    {!confirmation ? (
                      <div className="mt-5 flex gap-3">
                        <Button
                          className="flex-1 rounded-[16px]"
                          onClick={() =>
                            setConfirmation({
                              action: 'approve',
                              reasoning: 'Request is aligned with site need, supplier fit and active project policy.',
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 rounded-[16px] border-brand-err/25 text-brand-err hover:border-brand-err/50"
                          onClick={() =>
                            setConfirmation({
                              action: 'reject',
                              reasoning: 'Request should be challenged because cost, timing or supplier fit needs another check.',
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-4">
                        <div
                          className={clsx(
                            'rounded-[18px] px-4 py-4 text-sm',
                            confirmation.action === 'approve'
                              ? 'bg-emerald-100 text-slate-900'
                              : 'bg-red-100 text-slate-900',
                          )}
                        >
                          <div className="font-semibold">
                            {confirmation.action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
                          </div>
                          <div className="mt-2">{confirmation.reasoning}</div>
                        </div>
                        <div className="space-y-2 text-sm text-slate-600">
                          <div>Who requested? {selectedRequest.requester.name}, {selectedRequest.requester.role.toLowerCase()}.</div>
                          <div>What is being requested? {selectedRequest.item.quantity} of {selectedRequest.item.title.toLowerCase()}.</div>
                          <div>Does approval make sense? {selectedRequest.ai.recommendedAction}</div>
                        </div>
                        <div className="flex gap-3">
                          <Button className="flex-1 rounded-[16px]" onClick={confirmDecision}>
                            Confirm {confirmation.action}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 rounded-[16px]"
                            onClick={() => setConfirmation(null)}
                          >
                            Back
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 text-xs text-slate-500">
                      Current state: {selectedRequest.status}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCard({
  icon,
  title,
  rows,
  children,
}: {
  icon: JSX.Element;
  title: string;
  rows: Array<[string, string]>;
  children?: JSX.Element;
}): JSX.Element {
  return (
    <div className="rounded-[24px] border border-brand-line bg-white p-5">
      <div className="flex items-center gap-2 text-brand">
        {icon}
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-brand-line/70 pb-3 last:border-b-0 last:pb-0">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-right text-sm font-medium text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
