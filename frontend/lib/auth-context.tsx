"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi, Membership, User } from "./api";

interface AuthContextValue {
  user: User | null;
  organizations: Membership[];
  currentOrg: Membership | null;
  loading: boolean;
  setCurrentOrgId: (orgId: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CURRENT_ORG_KEY = "aether_current_org_id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Membership[]>([]);
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { user, organizations } = await authApi.me();
      setUser(user);
      setOrganizations(organizations);

      const stored =
        typeof window !== "undefined" ? window.localStorage.getItem(CURRENT_ORG_KEY) : null;
      const validStored = organizations.find((o) => o.organizationId === stored);
      setCurrentOrgIdState(validStored ? stored : organizations[0]?.organizationId ?? null);
    } catch {
      setUser(null);
      setOrganizations([]);
      setCurrentOrgIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCurrentOrgId = useCallback((orgId: string) => {
    setCurrentOrgIdState(orgId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENT_ORG_KEY, orgId);
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setOrganizations([]);
    setCurrentOrgIdState(null);
  }, []);

  const currentOrg = useMemo(
    () => organizations.find((o) => o.organizationId === currentOrgId) ?? null,
    [organizations, currentOrgId]
  );

  const value: AuthContextValue = {
    user,
    organizations,
    currentOrg,
    loading,
    setCurrentOrgId,
    refresh,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
