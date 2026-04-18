import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState('foreman@brueckesg.ch');
  const [password, setPassword] = useState('comstruct-demo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen grid place-items-center bg-brand-surface">
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
        className="card w-[360px] p-7"
      >
        <div className="text-2xl font-bold text-brand">comstruct</div>
        <div className="text-sm text-slate-500 mb-6">Sign in to the C-Materials Console</div>

        <label className="text-xs font-medium text-slate-600">Email</label>
        <input className="mt-1 mb-3 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
          value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label className="text-xs font-medium text-slate-600">Password</label>
        <input type="password"
          className="mt-1 mb-4 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
          value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="text-sm text-brand-err mb-3">{error}</div>}

        <button className="btn-primary w-full justify-center" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="mt-5 text-xs text-slate-500 leading-relaxed">
          Demo users (password <span className="font-mono">comstruct-demo</span>):<br />
          • foreman@brueckesg.ch<br />
          • pm@brueckesg.ch<br />
          • procurement@comstruct.com
        </div>
        <div className="mt-3 text-center text-xs text-slate-500">
          New here?{' '}
          <a href="/register" className="text-brand hover:underline">Create an account</a>
        </div>
      </form>
    </div>
  );
}
