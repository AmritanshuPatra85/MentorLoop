"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { buttonVariants } from "@/components/ui/button";

export function RejectedApplicationDetails() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      {user?.rejectionReason ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left">
          <p className="mb-1 text-sm font-medium">Reason from the review team</p>
          <p className="text-sm text-muted-foreground">{user.rejectionReason}</p>
        </div>
      ) : null}
      <Link className={buttonVariants()} href="/onboarding/mentor">
        Edit and resubmit <ArrowRight />
      </Link>
    </div>
  );
}
