import {
  apiErrorSchema,
  authResponseSchema,
  type AuthResponse,
  type AuthUser,
} from "@mentorloop/shared";
import type { z, ZodTypeAny } from "zod";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(init.message);
    this.name = "ApiClientError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

export type RequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Non-2xx statuses whose body should still be parsed with the success schema. */
  allowStatus?: number[];
  /** Auth endpoints (login, register, refresh, logout): no bearer token, no refresh-and-retry. */
  skipAuth?: boolean;
};

// ---------------------------------------------------------------------------
// Session state. Module-level on purpose: it lives outside React so the client
// can refresh and retry without touching component state.
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

type AuthListener = (session: AuthResponse | null) => void;
const listeners = new Set<AuthListener>();

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Store (or clear, with null) the current session and tell subscribers. */
export function applySession(session: AuthResponse | null): void {
  accessToken = session?.accessToken ?? null;
  for (const listener of listeners) listener(session);
}

/**
 * Replace the cached user while keeping the current access token.
 * Used after email verification (confirm returns user only, not a new JWT).
 */
export function updateSessionUser(user: AuthUser): void {
  if (!accessToken) return;
  applySession({ accessToken, user });
}

const REFRESH_LOCK = "mentorloop-refresh";
let inflightRefresh: Promise<AuthResponse | null> | null = null;

async function refreshOnce(): Promise<AuthResponse | null> {
  try {
    const session = await send("POST", "/auth/refresh", authResponseSchema, undefined, {
      skipAuth: true,
    });
    applySession(session);
    return session;
  } catch (err) {
    if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
      applySession(null);
      return null;
    }
    throw err;
  }
}

async function doRefresh(): Promise<AuthResponse | null> {
  // Web Locks serialise refreshes across tabs: the waiting tab sends the cookie
  // the first tab just rotated, instead of a stale one that would look like reuse.
  if (typeof navigator !== "undefined" && navigator.locks) {
    const session = await navigator.locks.request(REFRESH_LOCK, refreshOnce);
    return session;
  }
  return refreshOnce();
}

/** Single-flight: every concurrent caller shares one network request. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function send<S extends ZodTypeAny>(
  method: string,
  path: string,
  schema: S,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      signal: opts.signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken && !opts.skipAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...opts.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiClientError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Cannot reach the server. Check your connection and try again.",
    });
  }

  const text = await res.text();
  let json: unknown;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok && !opts.allowStatus?.includes(res.status)) {
    const parsedError = apiErrorSchema.safeParse(json);
    if (parsedError.success) {
      const { code, message, details, requestId } = parsedError.data.error;
      throw new ApiClientError({ status: res.status, code, message, details, requestId });
    }
    throw new ApiClientError({
      status: res.status,
      code: `HTTP_${res.status}`,
      message: res.statusText || "Request failed",
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError({
      status: res.status,
      code: "INVALID_RESPONSE",
      message: "The server returned an unexpected response.",
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

async function request<S extends ZodTypeAny>(
  method: string,
  path: string,
  schema: S,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<z.infer<S>> {
  const tokenAtStart = accessToken;
  try {
    return await send(method, path, schema, body, opts);
  } catch (err) {
    const unauthorized = err instanceof ApiClientError && err.status === 401 && !opts.skipAuth;
    if (!unauthorized) throw err;

    // Another request may already have refreshed the token while this one was in flight.
    if (accessToken && accessToken !== tokenAtStart) {
      return send(method, path, schema, body, opts);
    }
    const session = await refreshSession().catch(() => null);
    if (!session) throw err;
    return send(method, path, schema, body, opts);
  }
}

/** Fetch an authenticated non-JSON resource (for example, a calendar file). */
export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const sendFile = async () => fetch(`${API_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
  let response: Response;
  try {
    response = await sendFile();
  } catch {
    throw new ApiClientError({ status: 0, code: "NETWORK_ERROR", message: "Cannot reach the server. Check your connection and try again." });
  }
  if (response.status === 401) {
    const session = await refreshSession().catch(() => null);
    if (!session) throw new ApiClientError({ status: 401, code: "UNAUTHORIZED", message: "Please sign in again." });
    response = await sendFile();
  }
  if (!response.ok) throw new ApiClientError({ status: response.status, code: `HTTP_${response.status}`, message: "The calendar file could not be downloaded." });
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <S extends ZodTypeAny>(path: string, schema: S, opts?: RequestOptions) =>
    request("GET", path, schema, undefined, opts),
  post: <S extends ZodTypeAny>(path: string, schema: S, body?: unknown, opts?: RequestOptions) =>
    request("POST", path, schema, body, opts),
  put: <S extends ZodTypeAny>(path: string, schema: S, body?: unknown, opts?: RequestOptions) =>
    request("PUT", path, schema, body, opts),
  patch: <S extends ZodTypeAny>(path: string, schema: S, body?: unknown, opts?: RequestOptions) =>
    request("PATCH", path, schema, body, opts),
  delete: <S extends ZodTypeAny>(path: string, schema: S, opts?: RequestOptions) =>
    request("DELETE", path, schema, undefined, opts),
};
