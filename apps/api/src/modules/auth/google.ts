import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import {
  KIIT_EMAIL_DOMAIN,
  signupRoleSchema,
  type OAuthErrorCode,
  type SignupRole,
} from "@mentorloop/shared";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const FLOW_COOKIE = "ml_oauth";
const FLOW_ISSUER = "mentorloop:oauth"; // differs from the access-token issuer on purpose
const FLOW_TTL_SECONDS = 600;
const flowSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/** A failure the callback turns into a redirect to the web app with ?error=<code>. */
export class OAuthFailure extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "OAuthFailure";
  }
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

function googleConfig() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.API_URL.replace(/\/$/, "")}/auth/google/callback`,
  };
}

function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const, // the callback is a top-level GET navigation from Google
    path: "/auth/google",
  };
}

export function clearFlowCookie(res: Response): void {
  res.clearCookie(FLOW_COOKIE, flowCookieOptions());
}

export function flowCookieFrom(cookies: unknown): string | undefined {
  const value = (cookies as Record<string, unknown> | undefined)?.[FLOW_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Sets the signed flow cookie (state, nonce, PKCE verifier, chosen role) and returns Google's URL. */
export async function beginGoogleFlow(
  res: Response,
  role: SignupRole | undefined,
): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new OAuthFailure("not_configured");

  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const flow = await new SignJWT({ state, nonce, verifier, ...(role ? { role } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(FLOW_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(flowSecret);

  res.cookie(FLOW_COOKIE, flow, { ...flowCookieOptions(), maxAge: FLOW_TTL_SECONDS * 1000 });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  // UI hint only. The domain is enforced server-side after Google returns.
  if (role === "founder") params.set("hd", KIIT_EMAIL_DOMAIN);

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function readFlow(cookie: string | undefined) {
  if (!cookie) throw new OAuthFailure("invalid_state", "Missing flow cookie");
  try {
    const { payload } = await jwtVerify(cookie, flowSecret, {
      algorithms: ["HS256"],
      issuer: FLOW_ISSUER,
    });
    const { state, nonce, verifier } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") {
      throw new Error("malformed flow");
    }
    const role = signupRoleSchema.safeParse(payload.role);
    return { state, nonce, verifier, role: role.success ? role.data : undefined };
  } catch {
    throw new OAuthFailure("invalid_state", "Flow cookie invalid or expired");
  }
}

/** Validates state, exchanges the code, verifies the ID token, returns the Google profile. */
export async function completeGoogleFlow(
  flowCookie: string | undefined,
  code: string,
  state: string,
): Promise<{ profile: GoogleProfile; role: SignupRole | undefined }> {
  const cfg = googleConfig();
  if (!cfg) throw new OAuthFailure("not_configured");

  const flow = await readFlow(flowCookie);
  if (flow.state !== state) throw new OAuthFailure("invalid_state", "State mismatch");

  let idToken: string;
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, "google token exchange failed");
      throw new OAuthFailure("google_failed");
    }
    const json = (await response.json()) as { id_token?: unknown };
    if (typeof json.id_token !== "string") throw new OAuthFailure("google_failed");
    idToken = json.id_token;
  } catch (err) {
    if (err instanceof OAuthFailure) throw err;
    logger.warn({ err }, "google token exchange errored");
    throw new OAuthFailure("google_failed");
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: cfg.clientId,
    });
    if (payload.nonce !== flow.nonce) throw new Error("nonce mismatch");
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("missing sub or email");
    }
    const verified = payload.email_verified === true || payload.email_verified === "true";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    return {
      profile: {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: verified,
        name,
      },
      role: flow.role,
    };
  } catch (err) {
    logger.warn({ err }, "google id token rejected");
    throw new OAuthFailure("google_failed");
  }
}