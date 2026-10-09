import type { CookieOptions, Response } from "express";
import { env } from "../../config/env";

export const REFRESH_COOKIE = "ml_refresh";

// Scoped to /auth so the browser only sends it to the auth endpoints.
// Production: web and API are on different sites, so SameSite=None (+ Secure).
function baseOptions(): CookieOptions {
  const prod = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? "none" : "lax",
    path: "/auth",
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}