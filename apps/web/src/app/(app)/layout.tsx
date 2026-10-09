"use client";

import { usePathname } from "next/navigation";
import {
  RequireAuth,
  RequireApproved,
  RequireMentorOnboardingAccess,
  RequireRouteAccess,
} from "@/components/auth/auth-guards";
import { AppShell } from "@/components/layout/app-shell";
import type { ReactNode } from "react";

function AccountRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/onboarding/mentor" ? (
    <RequireMentorOnboardingAccess>{children}</RequireMentorOnboardingAccess>
  ) : (
    <RequireApproved>{children}</RequireApproved>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRouteAccess>
        <AccountRouteGate>
          <AppShell>{children}</AppShell>
        </AccountRouteGate>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
