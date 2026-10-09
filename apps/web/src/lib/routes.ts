import type { AuthUser, UserRole } from "@mentorloop/shared";

// ---------------------------------------------------------------------------
// Route prefixes each role is allowed to visit within the (app) group.
// The edge middleware cannot verify auth (token is in memory), so these
// rules are enforced by client-side guards. The API middleware (Sprint 2.3a)
// is the true security boundary.
// ---------------------------------------------------------------------------

const ROLE_ROUTES: Record<UserRole, readonly string[]> = {
  founder: [
    "/",
    "/discover",
    "/connections",
    "/sessions",
    "/profile",
    "/onboarding",
    "/design",
  ],
  mentor: [
    "/",
    "/feed",
    "/connections",
    "/sessions",
    "/availability",
    "/profile",
    "/onboarding",
    "/design",
  ],
  admin: ["/", "/admin", "/design"],
};

/** Routes that do NOT require authentication. */
export const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/verify-email",
  "/pending-approval",
  "/account-suspended",
  "/account-rejected",
] as const;

/**
 * Check whether a pathname is accessible to a given role.
 * "/" is matched exactly; everything else uses prefix matching.
 */
export function isRouteAllowedForRole(pathname: string, role: UserRole): boolean {
  const allowed = ROLE_ROUTES[role];
  if (!allowed) return false;

  if (pathname === "/") return allowed.includes("/");
  return allowed.some((prefix) => prefix !== "/" && pathname.startsWith(prefix));
}

/**
 * Determine the best route for a user after login (or when an auth guard
 * needs to bounce them somewhere sensible).
 *
 * Priority order mirrors the API's `requireApproved` middleware:
 *   1. suspended   → /account-suspended
 *   2. unverified  → /verify-email
 *   3. rejected    → /account-rejected
 *   4. pending     → /pending-approval
 *   5. active      → / (role dashboard)
 */
export function getPostLoginRoute(user: AuthUser): string {
  if (user.status === "suspended") return "/account-suspended";
  if (!user.emailVerified) return "/verify-email";
  if (user.status === "rejected") return "/account-rejected";
  if (user.status === "pending_approval")
    return user.role === "mentor" ? "/onboarding/mentor" : "/pending-approval";
  // Active — everyone lands on the dashboard; the sidebar shows role-specific links.
  return "/";
}
