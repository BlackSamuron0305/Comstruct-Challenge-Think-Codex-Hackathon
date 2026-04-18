import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, ShieldCheck, Upload } from 'lucide-react';
import { useAuthStore } from '../store/auth';

export function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState('procurement@comstruct.com');
  const [password, setPassword] = useState('comstruct-demo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-transparent px-4 py-10 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card relative overflow-hidden p-8 lg:p-12">
          <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,rgba(242,163,65,0.35),transparent_50%)]" />
          <div className="relative">
            <div className="inline-flex items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Procurement cockpit
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-bold leading-tight text-brand">
              Keep C-material ordering easy for site teams and fully visible for procurement.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              This workspace is for low-value, high-frequency site items like screws,
              PPE, tapes, sealants, lamps and other everyday consumables.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={<ClipboardCheck size={18} />}
                title="Fast order control"
                text="See what is pending, auto-approved, ordered and delivered without chasing calls or emails."
              />
              <FeatureCard
                icon={<ShieldCheck size={18} />}
                title="Threshold-based approvals"
                text="Route only the risky or expensive orders to a reviewer and keep routine site spend moving."
              />
              <FeatureCard
                icon={<Upload size={18} />}
                title="Messy supplier data in"
                text="Upload CSVs or contract PDFs, review AI mapping and keep the catalog focused on relevant C-materials."
              />
            </div>
          </div>
        </section>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await login(email, password);
              nav('/orders');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Login failed');
            } finally {
              setBusy(false);
            }
          }}
          className="card flex flex-col justify-center p-7 lg:p-10"
        >
          <div className="text-2xl font-bold text-brand">comstruct</div>
          <div className="mb-6 text-sm text-slate-500">
            Sign in to the procurement website
          </div>

          <label className="text-xs font-medium text-slate-600">Email</label>
          <input
            className="mt-1 mb-3 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="text-xs font-medium text-slate-600">Password</label>
          <input
            type="password"
            className="mt-1 mb-4 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="mb-3 text-sm text-brand-err">{error}</div>}

          <button className="btn-primary w-full justify-center" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Open workspace'} <ArrowRight size={16} />
          </button>

          <div className="mt-5 rounded-2xl bg-brand-surface/80 p-4 text-xs leading-relaxed text-slate-600">
            <div className="font-semibold uppercase tracking-[0.16em] text-slate-500">
              Demo users
            </div>
            <div className="mt-2">
              Password: <span className="font-mono">comstruct-demo</span>
            </div>
            <div className="mt-2">
              <span className="font-mono">procurement@comstruct.com</span> for procurement admin
            </div>
            <div>
              <span className="font-mono">pm@brueckesg.ch</span> for project manager
            </div>
            <div>
              <span className="font-mono">foreman@brueckesg.ch</span> for site foreman
            </div>
          </div>
          <div className="mt-3 text-center text-xs text-slate-500">
            New here?{' '}
            <a href="/register" className="text-brand hover:underline">
              Create an account
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: JSX.Element;
  title: string;
  text: string;
}): JSX.Element {
  return (
    <div className="rounded-3xl border border-brand-line/80 bg-brand-card/70 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-brand-surface">
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-brand">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
