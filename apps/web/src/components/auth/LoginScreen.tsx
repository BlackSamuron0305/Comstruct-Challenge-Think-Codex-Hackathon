import { useEffect, useState, type FormEvent } from "react";
import logo from "@/assets/comstruct-logo.svg";
import { useAuth } from "./AuthContext";

const LAST_EMAIL_KEY = "comstruct-last-email";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem(LAST_EMAIL_KEY);
      if (savedEmail) setEmail(savedEmail);
    } catch {
      // Ignore storage issues in locked-down environments.
    }
  }, []);

  const fillDemoUser = (nextEmail: string) => {
    setEmail(nextEmail);
    setPassword("comstruct-demo");
    setError("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      try {
        window.localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {
        // Ignore storage issues in locked-down environments.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Check your work email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <img src={logo} alt="comstruct" className="h-16 w-auto max-w-[220px]" />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-display text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your work email to access the dashboard, or pick a demo role to review the flows instantly.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => fillDemoUser("procurement@comstruct.com")} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">
              Procurement demo
            </button>
            <button type="button" onClick={() => fillDemoUser("foreman@brueckesg.ch")} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">
              Foreman demo
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@comstruct.eu"
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-10 w-full rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-4 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground text-center">
            Shared demo password: comstruct-demo · your last email stays prefilled on this device.
          </div>
        </div>
      </div>
    </div>
  );
}
