import { Router } from "express";
import { pingResponseSchema, type HealthResponse, type PingResponse } from "@mentorloop/shared";
import { pool } from "../../db/client";
import { redis } from "../../lib/redis";
import { asyncHandler } from "../../lib/async-handler";

type Check = HealthResponse["checks"]["postgres"];

async function timed(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<Check> {
  const start = performance.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

export const healthRouter = Router();

healthRouter.get("/ping", (_req, res) => {
  const body: PingResponse = pingResponseSchema.parse({
    ok: true,
    service: "mentorloop-api",
    time: new Date().toISOString(),
  });
  res.json(body);
});

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const [postgres, redisCheck] = await Promise.all([
      timed(() => pool.query("SELECT 1")),
      timed(() => redis.ping()),
    ]);
    const healthy = postgres.ok && redisCheck.ok;
    const body: HealthResponse = {
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
      checks: { postgres, redis: redisCheck },
    };
    res.status(healthy ? 200 : 503).json(body);
  }),
);