import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../config/logger";

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const header = req.headers["x-request-id"];
    const id =
      typeof header === "string" && header.length > 0 && header.length <= 100
        ? header
        : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  // 5xx responses are logged once, with the real stack, by the error handler.
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return "silent";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  autoLogging: { ignore: (req) => req.url === "/health" },
});