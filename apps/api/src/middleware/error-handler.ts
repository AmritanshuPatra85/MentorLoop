import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { ApiError } from "@mentorloop/shared";
import { AppError, NotFoundError } from "../lib/errors";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

function bodyParserError(err: unknown): { status: number; code: string; message: string } | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { type?: unknown; status?: unknown };
  if (e.type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "Request body is not valid JSON" };
  }
  if (e.type === "entity.too.large") {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  }
  return null;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong";
  let details: unknown;

  const parserErr = bodyParserError(err);
  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (parserErr) {
    ({ status, code, message } = parserErr);
  }

  if (status >= 500) req.log.error({ err }, "unhandled error");

  const body: ApiError = {
    error: { code, message, ...(details !== undefined ? { details } : {}), requestId: String(req.id) },
  };
  res.status(status).json(body);
};