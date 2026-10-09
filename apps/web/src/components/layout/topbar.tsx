"use client";

import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/common/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
      // RequireAuth redirects to /login once the session is cleared.
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : "Could not sign out. Please try again.",
      );
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>
      <div className="lg:hidden">
        <Brand />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {user ? (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-muted-foreground">{user.fullName}</span>
            <Badge variant="secondary" className="capitalize">
              {user.role}
            </Badge>
          </div>
        ) : null}
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          disabled={signingOut}
          aria-label="Sign out"
        >
          <LogOut />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}