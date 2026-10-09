"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@mentorloop/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applySession, refreshSession, subscribeAuth } from "@/lib/api-client";
import { logoutSession } from "@/lib/auth-api";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated"; user: null };

type AuthContextValue = AuthState & { logout: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    const unsubscribe = subscribeAuth((session) => {
      if (session) {
        setState({ status: "authenticated", user: session.user });
      } else {
        setState({ status: "unauthenticated", user: null });
        queryClient.clear();
      }
    });

    // Restore the session on page load. Single-flight, so Strict Mode's double
    // effect run still sends exactly one request.
    refreshSession().catch(() => setState({ status: "unauthenticated", user: null }));

    return unsubscribe;
  }, [queryClient]);

  const logout = useCallback(async () => {
    await logoutSession();
    applySession(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, logout }), [state, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}