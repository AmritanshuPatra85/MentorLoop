"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { getPostLoginRoute } from "@/lib/routes";

/** Auth-aware CTA for the global 404 page — avoids looping gate redirects. */
export function NotFoundActions() {
  const { status, user } = useAuth();

  const href =
    status === "authenticated" && user
      ? getPostLoginRoute(user)
      : status === "unauthenticated"
        ? "/login"
        : "/";

  const label =
    status === "authenticated" && user && !user.emailVerified
      ? "Continue verification"
      : status === "unauthenticated"
        ? "Sign in"
        : "Back to dashboard";

  return (
    <Link href={href} className={buttonVariants({ className: "mt-6" })}>
      {label}
    </Link>
  );
}
