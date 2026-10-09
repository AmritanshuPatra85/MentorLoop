import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  loginSchema,
  registerSchema,
  signupRoleSchema,
  verifyEmailSchema,
  type AuthResponse,
  type LoginInput,
  type MeResponse,
  type OAuthErrorCode,
  type RegisterInput,
  type VerifyEmailInput,
} from "@mentorloop/shared";
import { env } from "../../config/env";
import { asyncHandler } from "../../lib/async-handler";
import { UnauthorizedError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import { validate } from "../../middleware/validate";
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from "./cookies";
import * as authService from "./auth.service";
import type { Session } from "./auth.service";
import {
  beginGoogleFlow,
  clearFlowCookie,
  completeGoogleFlow,
  flowCookieFrom,
  OAuthFailure,
} from "./google";
import * as verification from "./verification.service";

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function sessionMeta(req: Request): authService.SessionMeta {
  return {
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
  };
}

function refreshCookieFrom(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function respondWithSession(res: Response, session: Session, status = 200) {
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  const body: AuthResponse = { accessToken: session.accessToken, user: session.user };
  res.status(status).json(body);
}

authRouter.post(
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.register(req.body as RegisterInput, sessionMeta(req));
    respondWithSession(res, session, 201);
  }),
);

authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body as LoginInput, sessionMeta(req));
    respondWithSession(res, session);
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = refreshCookieFrom(req);
    if (!token) throw new UnauthorizedError("No refresh token");
    try {
      respondWithSession(res, await authService.refresh(token, sessionMeta(req)));
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await authService.logout(refreshCookieFrom(req));
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.auth!.userId);
    const body: MeResponse = { user };
    res.json(body);
  }),
);

// ---- Email verification (OTP) ----

authRouter.post(
  "/verify-email/request",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await verification.requestVerificationCode(req.auth!.userId);
    res.status(202).json(result);
  }),
);

authRouter.post(
  "/verify-email/confirm",
  requireAuth,
  validate({ body: verifyEmailSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    await verification.confirmVerificationCode(userId, (req.body as VerifyEmailInput).code);
    const body: MeResponse = { user: await authService.getMe(userId) };
    res.json(body);
  }),
);

// ---- Google OAuth ----
// Every failure here is a browser navigation, so errors become redirects, not JSON.

function redirectWithError(res: Response, code: OAuthErrorCode) {
  const page = code === "founder_requires_kiit" ? "/register" : "/login";
  const url = new URL(page, env.WEB_URL);
  url.searchParams.set("error", code);
  res.redirect(url.toString());
}

const googleStartQuery = z.object({ role: signupRoleSchema.optional() });

authRouter.get(
  "/google",
  asyncHandler(async (req, res) => {
    const query = googleStartQuery.safeParse(req.query);
    if (!query.success) return redirectWithError(res, "google_failed");
    try {
      res.redirect(await beginGoogleFlow(res, query.data.role));
    } catch (err) {
      if (err instanceof OAuthFailure) return redirectWithError(res, err.code);
      throw err;
    }
  }),
);

const googleCallbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const flowCookie = flowCookieFrom(req.cookies);
    clearFlowCookie(res); // one-shot, whatever happens next

    const query = googleCallbackQuery.safeParse(req.query);
    if (!query.success) return redirectWithError(res, "google_failed");
    const { code, state, error } = query.data;
    if (error) return redirectWithError(res, error === "access_denied" ? "access_denied" : "google_failed");
    if (!code || !state) return redirectWithError(res, "invalid_state");

    try {
      const { profile, role } = await completeGoogleFlow(flowCookie, code, state);
      const session = await authService.signInWithGoogle(profile, role, sessionMeta(req));
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
      // The web app trades the refresh cookie for an access token via POST /auth/refresh.
      res.redirect(new URL("/oauth/callback", env.WEB_URL).toString());
    } catch (err) {
      if (err instanceof OAuthFailure) return redirectWithError(res, err.code);
      req.log.error({ err }, "google sign-in failed");
      redirectWithError(res, "google_failed");
    }
  }),
);