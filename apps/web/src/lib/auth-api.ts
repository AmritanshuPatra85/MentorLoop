import {
  authResponseSchema,
  codeRequestResponseSchema,
  meResponseSchema,
  type AuthResponse,
  type AuthUser,
  type CodeRequestResponse,
  type LoginInput,
  type RegisterInput,
} from "@mentorloop/shared";
import { z } from "zod";
import { api, applySession, updateSessionUser } from "@/lib/api-client";

export async function registerAccount(input: RegisterInput): Promise<AuthResponse> {
  const session = await api.post("/auth/register", authResponseSchema, input, { skipAuth: true });
  applySession(session);
  return session;
}

export async function loginWithPassword(input: LoginInput): Promise<AuthResponse> {
  const session = await api.post("/auth/login", authResponseSchema, input, { skipAuth: true });
  applySession(session);
  return session;
}

/** Revokes the refresh-token family server-side. The caller clears local state on success. */
export async function logoutSession(): Promise<void> {
  await api.post("/auth/logout", z.undefined(), undefined, { skipAuth: true });
}

export async function requestEmailVerification(): Promise<CodeRequestResponse> {
  return api.post("/auth/verify-email/request", codeRequestResponseSchema);
}

export async function confirmEmailVerification(code: string): Promise<AuthUser> {
  const { user } = await api.post("/auth/verify-email/confirm", meResponseSchema, { code });
  updateSessionUser(user);
  return user;
}
