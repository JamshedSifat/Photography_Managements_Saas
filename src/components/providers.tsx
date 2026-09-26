"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { Toaster } from "sonner";
import { api, fetcher, tokenStore } from "@/lib/client-api";
import type { AuthResponse, Role, SessionUser } from "@/lib/shared";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
  inviteCode?: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  status: AuthStatus;
  login: (input: { email: string; password: string; role?: Role }) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  setUser: (user: SessionUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const { mutate } = useSWRConfig();

  const reload = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser }>("/auth/me");
      setUserState(data.user);
      setStatus("authenticated");
    } catch {
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onExpired = () => {
      tokenStore.clear();
      setUserState(null);
      setStatus("unauthenticated");
    };
    window.addEventListener("lumiere:auth-expired", onExpired);
    return () => window.removeEventListener("lumiere:auth-expired", onExpired);
  }, []);

  const apply = useCallback((data: AuthResponse) => {
    tokenStore.set(data.access, data.refresh);
    setUserState(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string; role?: Role }) => apply(await api<AuthResponse>("/auth/login", { method: "POST", body: input })),
    [apply],
  );

  const register = useCallback(
    async (input: RegisterInput) => apply(await api<AuthResponse>("/auth/register", { method: "POST", body: input })),
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    tokenStore.clear();
    setUserState(null);
    setStatus("unauthenticated");
    await mutate(() => true, undefined, { revalidate: false });
  }, [mutate]);

  const setUser = useCallback((u: SessionUser) => setUserState(u), []);

  const value = useMemo(
    () => ({ user, status, login, register, logout, reload, setUser }),
    [user, status, login, register, logout, reload, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true, dedupingInterval: 1500 }}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster
        theme="dark"
        position="top-right"
        closeButton
        toastOptions={{
          style: {
            background: "rgba(18,18,22,0.94)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fafafa",
            backdropFilter: "blur(16px)",
            borderRadius: "16px",
          },
        }}
      />
    </SWRConfig>
  );
}
