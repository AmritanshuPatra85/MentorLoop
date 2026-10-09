import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

redis.on("error", (err: NodeJS.ErrnoException) => {
  logger.error({ code: err.code ?? err.name, message: err.message || undefined }, "redis error");
});