import { logger } from "../config/logger";

export type Email = { to: string; subject: string; text: string };

/**
 * Console transport. Sprint 7.3 replaces the body of this function with Resend;
 * callers stay unchanged.
 */
export async function sendEmail(email: Email): Promise<void> {
  logger.info(
    `\n================ EMAIL (console transport) ================\n` +
      `To:      ${email.to}\n` +
      `Subject: ${email.subject}\n\n` +
      `${email.text}\n` +
      `===========================================================`,
  );
}