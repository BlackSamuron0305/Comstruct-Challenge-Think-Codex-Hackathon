import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { clearSession, getCurrentUser, loginWithCredentials, type AuthUser } from "@/lib/api";

const SESSION_EVENT = "comstruct-auth-changed";

type AuthCtx = {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncUser = () => {
      setUser(getCurrentUser());
      setReady(true);
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener(SESSION_EVENT, syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(SESSION_EVENT, syncUser);
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!email.trim() || !password) {
      throw new Error("Please enter your email and password.");
    }
    const nextUser = await loginWithCredentials(email.trim(), password);
    setUser(nextUser);
  };

  const logout = () => {
    clearSession().then(() => setUser(null)).catch(() => setUser(null));
  };

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm text-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <div className="font-medium">Restoring your workspace</div>
              <p className="mt-1 text-muted-foreground">
                Your last session and saved view are being reconnected now.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
