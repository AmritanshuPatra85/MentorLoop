"use client";

import type { UserRole } from "@mentorloop/shared";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getPostLoginRoute, isRouteAllowedForRole } from "@/lib/routes";

function FullPageSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-dvh place-items-center text-muted-foreground"
    >
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard: must be logged in
// ---------------------------------------------------------------------------

/** Redirect unauthenticated visitors to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return <FullPageSpinner />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Guard: role gate
// ---------------------------------------------------------------------------

/**
 * Only renders children when the authenticated user has one of the allowed
 * roles. Otherwise redirects to the user's default route.
 */
export function RequireRole({
  allowed,
  children,
}: {
  allowed: UserRole[];
  children: ReactNode;
}) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user && !allowed.includes(user.role)) {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, allowed, router]);

  if (status !== "authenticated") return <FullPageSpinner />;
  if (!user || !allowed.includes(user.role)) return <FullPageSpinner />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Guard: account must be active (approved, email verified, not suspended)
// ---------------------------------------------------------------------------

/**
 * Mirrors the API's `requireApproved` middleware on the client side.
 * Redirects users with non-active accounts to the appropriate status page.
 */
export function RequireApproved({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;

    // Email verification takes precedence (matches API middleware order)
    if (!user.emailVerified) {
      router.replace("/verify-email");
      return;
    }
    if (user.status !== "active") {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, router]);

  if (status !== "authenticated") return <FullPageSpinner />;
  if (!user || !user.emailVerified || user.status !== "active")
    return <FullPageSpinner />;
  return <>{children}</>;
}

/** Pending mentors may enter only their onboarding route until the profile is submitted. */
export function RequireMentorOnboardingAccess({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (!user.emailVerified) {
      router.replace("/verify-email");
    } else if (user.status === "suspended") {
      router.replace("/account-suspended");
    } else if (user.role !== "mentor" || user.status === "active") {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, router]);

  if (status !== "authenticated") return <FullPageSpinner />;
  if (
    !user ||
    !user.emailVerified ||
    user.status === "suspended" ||
    user.role !== "mentor" ||
    user.status === "active"
  ) {
    return <FullPageSpinner />;
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Guard: route is allowed for this role
// ---------------------------------------------------------------------------

/**
 * Checks the current pathname against the role's allowed routes.
 * If the route is forbidden, redirects to the user's default route.
 */
export function RequireRouteAccess({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (!isRouteAllowedForRole(pathname, user.role)) {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, pathname, router]);

  if (status !== "authenticated") return <FullPageSpinner />;
  if (!user || !isRouteAllowedForRole(pathname, user.role)) return <FullPageSpinner />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Guard: redirect away from auth pages if already logged in
// ---------------------------------------------------------------------------

/** Redirect already-authenticated visitors to their role-appropriate page. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(getPostLoginRoute(user));
    }
  }, [status, user, router]);

  if (status !== "unauthenticated") return <FullPageSpinner />;
  return <>{children}</>;
}
