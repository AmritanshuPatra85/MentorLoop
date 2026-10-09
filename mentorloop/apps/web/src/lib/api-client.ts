import { apiErrorSchema } from "@mentorloop/shared";
import type { z, ZodTypeAny } from "zod";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

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
};

async function request<S extends ZodTypeAny>(
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