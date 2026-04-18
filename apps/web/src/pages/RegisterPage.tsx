import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';

const ROLES = [
  { value: 'foreman', label: 'Foreman (Bauleiter)', desc: 'Order materials for your projects' },
  { value: 'project_manager', label: 'Project Manager', desc: 'Approve orders and manage projects' },
  { value: 'supplier_admin', label: 'Supplier Admin', desc: 'Manage supplier catalog and deliveries' },
] as const;

const TRADES = [
  'electrician', 'carpenter', 'steel_fitter', 'concrete_worker',
  'plumber', 'mason', 'painter', 'roofer', 'general',
] as const;

const GLOVE_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

export function RegisterPage(): JSX.Element {
  const nav = useNavigate();
  const setAuth = useAuthStore.setState;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'foreman',
    phone: '',
    company_name: '',
    company_id: '',
    trade: '',
    preferred_language: 'de',
    glove_size: '',
  });

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen grid place-items-center bg-brand-surface">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const payload = {
              ...form,
              company_name: form.company_name || undefined,
              company_id: form.company_id || undefined,
              trade: form.trade || undefined,
              glove_size: form.glove_size || undefined,
              phone: form.phone || undefined,
            };
            const r = await api.post('/auth/register', payload);
            setAuth({
              user: r.data.user,
              accessToken: r.data.access_token,
              refreshToken: r.data.refresh_token,
            });
            nav('/orders');
          } catch (err: unknown) {
            const msg =
              err && typeof err === 'object' && 'response' in err
                ? (err as { response: { data: { error?: string } } }).response?.data?.error
                : 'Registration failed';
            setError(msg || 'Registration failed');
          } finally {
            setBusy(false);
          }
        }}
        className="card w-[480px] p-7"
      >
        <div className="text-2xl font-bold text-brand">comstruct</div>
        <div className="text-sm text-slate-500 mb-6">Create your account</div>

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Full name</label>
            <input
              className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Phone</label>
            <input
              className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>
        </div>

        <label className="text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          className="mt-1 mb-3 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          required
        />

        <label className="text-xs font-medium text-slate-600">Password (min 8 chars)</label>
        <input
          type="password"
          className="mt-1 mb-4 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          minLength={8}
          required
        />

        {/* Role selection */}
        <label className="text-xs font-medium text-slate-600">Role</label>
        <div className="mt-1 mb-4 space-y-2">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${form.role === r.value ? 'border-brand bg-brand/5' : 'border-brand-line hover:bg-brand-surface'
                }`}
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={form.role === r.value}
                onChange={() => update('role', r.value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-slate-500">{r.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Company */}
        <label className="text-xs font-medium text-slate-600">Company name (new) or ID (existing)</label>
        <div className="grid grid-cols-2 gap-3 mt-1 mb-4">
          <input
            className="rounded-md border border-brand-line px-3 py-2 text-sm"
            placeholder="New company name"
            value={form.company_name}
            onChange={(e) => { update('company_name', e.target.value); update('company_id', ''); }}
          />
          <input
            className="rounded-md border border-brand-line px-3 py-2 text-sm font-mono"
            placeholder="Existing company ID"
            value={form.company_id}
            onChange={(e) => { update('company_id', e.target.value); update('company_name', ''); }}
          />
        </div>

        {/* Worker profile — only for foreman */}
        {form.role === 'foreman' && (
          <div className="border border-brand-line rounded-md p-4 mb-4">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-3">Worker Profile</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Trade</label>
                <select
                  className="mt-1 w-full rounded-md border border-brand-line px-2 py-2 text-sm"
                  value={form.trade}
                  onChange={(e) => update('trade', e.target.value)}
                >
                  <option value="">Select trade</option>
                  {TRADES.map((t) => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Glove size</label>
                <select
                  className="mt-1 w-full rounded-md border border-brand-line px-2 py-2 text-sm"
                  value={form.glove_size}
                  onChange={(e) => update('glove_size', e.target.value)}
                >
                  <option value="">Select</option>
                  {GLOVE_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Language</label>
                <select
                  className="mt-1 w-full rounded-md border border-brand-line px-2 py-2 text-sm"
                  value={form.preferred_language}
                  onChange={(e) => update('preferred_language', e.target.value)}
                >
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-brand-err mb-3">{error}</div>}

        <button className="btn-primary w-full justify-center" disabled={busy} type="submit">
          {busy ? 'Creating account…' : 'Register'}
        </button>

        <div className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <a href="/login" className="text-brand hover:underline">Sign in</a>
        </div>
      </form>
    </div>
  );
}
