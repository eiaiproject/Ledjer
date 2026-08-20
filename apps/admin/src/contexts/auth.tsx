import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
}

interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    return apiRequest<{ admin: AdminUser | null }>("/api/admin/auth/me");
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchMe();
    setAdmin(data.admin);
  }, [fetchMe]);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (!cancelled) setAdmin(data.admin);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    await apiRequest("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Ignore — cookie is cleared client-side regardless.
    }
    setAdmin(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({ admin, loading, login, logout, refresh }),
    [admin, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
