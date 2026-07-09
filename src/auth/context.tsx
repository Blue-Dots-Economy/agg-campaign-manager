import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const AUTH_EMAIL = "admin@bluedots.com";
const AUTH_PASSWORD = "456789";
const STORAGE_KEY = "rozgar-auth";

type AuthContextValue = {
  isAuthenticated: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setIsAuthenticated(window.localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // ignore
      }
    }
    setHydrated(true);
  }, []);

  const login = (email: string, password: string) => {
    const emailOk = email.trim().toLowerCase() === AUTH_EMAIL.toLowerCase();
    const passOk = password === AUTH_PASSWORD;
    if (emailOk && passOk) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {
          // ignore
        }
      }
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, hydrated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
