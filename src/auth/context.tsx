import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resolveLogin } from "@/lib/reviewers.functions";

const STORAGE_KEY = "rozgar-auth";
export type Role = "admin" | "user";
export type Session = { email: string; role: Role };

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const resolve = useServerFn(resolveLogin);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.email && (parsed.role === "admin" || parsed.role === "user")) setSession(parsed);
        }
      } catch { /* ignore */ }
    }
    setHydrated(true);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await resolve({ data: { email, password } });
    if (res?.role) {
      const s: Session = { email: email.trim().toLowerCase(), role: res.role };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
      }
      setSession(s);
      return true;
    }
    return false;
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isAuthenticated: !!session, isAdmin: session?.role === "admin", hydrated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
