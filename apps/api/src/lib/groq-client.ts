import Groq from "groq-sdk";
import { env } from "../config/env";

export const GROQ_REQUEST_TIMEOUT_MS = 60_000;

/** Shared Groq SDK client for background AI features. Empty keys keep the API bootable. */
export const groqClient = env.GROQ_API_KEY
  ? new Groq({ apiKey: env.GROQ_API_KEY, timeout: GROQ_REQUEST_TIMEOUT_MS, maxRetries: 2 })
  : null;
