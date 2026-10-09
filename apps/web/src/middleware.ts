import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Edge Middleware — Sprint 2.3b
 *
 * The access token lives in JS memory (not a cookie), so this middleware
 * cannot verify authentication or enforce role checks.  Those are handled by:
 *   • Client-side guards: RequireAuth, RequireRole, RequireApproved
 *   • API middleware:     requireAuth, requireRole, requireApproved
 *
 * What this middleware DOES:
 *   1. Adds browser-security headers to every response.
 *   2. Provides a hook point for future edge-level checks if the auth
 *      architecture ever moves to cookie-based JWTs.
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // ---- Security headers ----
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every route except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico   (browser icon)
     *   - common image extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
