"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";

/**
 * Sign-out button shown on every account-status gate page.
 * Shared across pending-approval, account-suspended and account-rejected.
 */
export function StatusPageActions() {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
      // RequireAuth in the (status) layout will redirect to /login.
    } catch (err) {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Could not sign out. Please try again.",
      );
      setSigningOut(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSignOut}
      disabled={signingOut}
      className="mt-2"
    >
      <LogOut className="mr-2 size-4" />
      Sign out
    </Button>
  );
}
