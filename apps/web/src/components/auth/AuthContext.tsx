import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
    clearSession();
    setUser(null);
  };

  if (!ready) return null;

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
