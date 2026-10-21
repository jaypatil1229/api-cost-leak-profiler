"use client";

import * as React from "react";
import { apiRequest, clearSessionTokens, refreshStoredSession, setUnauthorizedHandler, storeTokens } from "@/lib/api/client";
import type { OrganizationSummary, User } from "@/lib/api/types";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshTokenExpiresAt: string;
}
interface AuthResponse { user: User; tokens: Tokens }
interface MeResponse { user: User; organizations: OrganizationSummary[] }
interface SessionValue {
  user: User | null;
  organizations: OrganizationSummary[];
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: { email: string; name: string; password: string; organizationName?: string }): Promise<void>;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [organizations, setOrganizations] = React.useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reloadUser = React.useCallback(async () => {
    const me = await apiRequest<MeResponse>("/auth/me");
    setUser(me.user);
    setOrganizations(me.organizations);
  }, []);

  React.useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => {
      if (active) {
        setUser(null);
        setOrganizations([]);
      }
    });
    void (async () => {
      try {
        const token = await refreshStoredSession();
        if (token && active) await reloadUser();
      } catch {
        clearSessionTokens();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, [reloadUser]);

  const accept = React.useCallback(async (response: AuthResponse) => {
    storeTokens(response.tokens);
    setUser(response.user);
    await reloadUser();
  }, [reloadUser]);

  const login = React.useCallback(async (email: string, password: string) => {
    const response = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST", auth: false, body: { email, password },
    });
    await accept(response);
  }, [accept]);

  const register = React.useCallback(async (input: { email: string; name: string; password: string; organizationName?: string }) => {
    const response = await apiRequest<AuthResponse>("/auth/register", {
      method: "POST", auth: false, body: input,
    });
    await accept(response);
  }, [accept]);

  const logout = React.useCallback(async () => {
    const storedRefreshToken = window.sessionStorage.getItem("aclp.refresh-token.v1");
    try {
      if (storedRefreshToken && await refreshStoredSession()) {
        const refreshToken = window.sessionStorage.getItem("aclp.refresh-token.v1");
        if (refreshToken) await apiRequest("/auth/logout", { method: "POST", body: { refreshToken }, retryAuth: false });
      }
    } finally {
      clearSessionTokens();
      setUser(null);
      setOrganizations([]);
    }
  }, []);

  const value = React.useMemo(() => ({ user, organizations, loading, login, register, logout, reloadUser }), [user, organizations, loading, login, register, logout, reloadUser]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
