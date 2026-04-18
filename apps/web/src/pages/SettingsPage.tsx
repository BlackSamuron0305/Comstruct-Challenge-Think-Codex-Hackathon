import { useState } from 'react';

const INITIAL_THRESHOLDS = [
  { project: 'Bruecke St. Gallen', autoApprove: 200, pmApprove: 500, approver: 'K. Mueller' },
  { project: 'Neubau Zuerich Nord', autoApprove: 150, pmApprove: 400, approver: 'S. Weber' },
  { project: 'Sanierung Basel', autoApprove: 300, pmApprove: 600, approver: 'K. Mueller' },
];

const CATEGORY_RULES = [
  { category: 'Fasteners', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'PPE', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'Tools', blocked: false, reason: 'Allowed in C-material flow' },
  { category: 'Building materials', blocked: true, reason: 'Use A-material process' },
  { category: 'Machinery', blocked: true, reason: 'Use A-material process' },
];

export function SettingsPage(): JSX.Element {
  const [thresholds, setThresholds] = useState(INITIAL_THRESHOLDS);
  const [saved, setSaved] = useState(false);

  const updateThreshold = (
    index: number,
    field: 'autoApprove' | 'pmApprove' | 'approver',
    value: string,
  ) => {
    setThresholds((current) =>
      current.map((entry, currentIndex) =>
        currentIndex === index
          ? {
              ...entry,
              [field]: field === 'approver' ? value : Number(value),
            }
          : entry,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="panel-title">Settings</div>
        <h1 className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-slate-900">
          Approval thresholds and category rules
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Configure which project orders auto-approve and which categories stay outside the C-material flow.
        </p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-brand-line px-6 py-5">
          <div className="text-base font-semibold text-slate-900">Approval thresholds per project</div>
          <div className="mt-1 text-sm text-slate-500">
            Orders below the auto-approve value go straight through. Higher value orders route to the approver.
          </div>
        </div>
        <div className="px-6">
          {thresholds.map((threshold, index) => (
            <div
              key={threshold.project}
              className="grid gap-4 border-b border-brand-line py-5 lg:grid-cols-[1fr_140px_140px_170px]"
            >
              <div className="text-sm font-medium text-slate-900">{threshold.project}</div>
              <SettingInput
                label="Auto-approve (EUR)"
                value={String(threshold.autoApprove)}
                onChange={(value) => updateThreshold(index, 'autoApprove', value)}
              />
              <SettingInput
                label="PM approval (EUR)"
                value={String(threshold.pmApprove)}
                onChange={(value) => updateThreshold(index, 'pmApprove', value)}
              />
              <SettingInput
                label="Approver"
                value={threshold.approver}
                onChange={(value) => updateThreshold(index, 'approver', value)}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-6 py-5">
          <button
            className="btn-primary"
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
          >
            Save thresholds
          </button>
          {saved && <span className="text-sm font-semibold text-brand-ok">Saved</span>}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-brand-line px-6 py-5">
          <div className="text-base font-semibold text-slate-900">Category rules</div>
          <div className="mt-1 text-sm text-slate-500">
            Block categories that should stay in the A-material or specialist procurement process.
          </div>
        </div>
        <div className="px-6 py-3">
          {CATEGORY_RULES.map((rule) => (
            <div
              key={rule.category}
              className="flex items-center gap-4 border-b border-brand-line py-4 last:border-b-0"
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
