import express from "express";
import { pingResponseSchema, type PingResponse } from "@mentorloop/shared";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.get("/ping", (_req, res) => {
  const body: PingResponse = pingResponseSchema.parse({
    ok: true,
    service: "mentorloop-api",
    time: new Date().toISOString(),
  });
  res.json(body);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});