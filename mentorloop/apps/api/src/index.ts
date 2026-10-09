import express from "express";
import { pingResponseSchema, type PingResponse } from "@mentorloop/shared";
import { env } from "./config/env";

const app = express();

app.get("/ping", (_req, res) => {
  const body: PingResponse = pingResponseSchema.parse({
    ok: true,
    service: "mentorloop-api",
    time: new Date().toISOString(),
  });
  res.json(body);
});

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});