import type { ReactNode } from "react";
import { RedirectIfAuthenticated } from "@/components/auth/auth-guards";
import { Brand } from "@/components/common/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <RedirectIfAuthenticated>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="flex justify-center">
          <Brand />
        </div>
        {children}
      </main>
    </RedirectIfAuthenticated>
  );
}