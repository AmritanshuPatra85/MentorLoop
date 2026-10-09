import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/auth-guards";
import { Brand } from "@/components/common/brand";

/**
 * Layout for account-status gate pages.
 *
 * These pages are shown to authenticated users whose account is not yet
 * fully active (verify email, pending approval, suspended, rejected).
 * The layout wraps children with RequireAuth so we know WHO the user is,
 * but intentionally does NOT use RequireApproved — that would redirect
 * back here in a loop.
 */
export default function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-10">
        <Brand />
        {children}
      </main>
    </RequireAuth>
  );
}
