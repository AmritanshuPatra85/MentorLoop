import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { debugRouter } from "./modules/debug/debug.routes";
import { healthRouter } from "./modules/health/health.routes";

export function createApp() {
  const app = express();

  if (env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(requestLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use(healthRouter);
  if (env.NODE_ENV === "development") app.use("/debug", debugRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}