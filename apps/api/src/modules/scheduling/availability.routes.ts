import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { availabilityExceptionInputSchema, availabilityResponseSchema, availabilityUpdateSchema, availableSlotsResponseSchema, slotRangeQuerySchema } from "@mentorloop/shared";
import { z } from "zod";
import { db, pool } from "../../db/client";
import { availabilityExceptions } from "../../db/schema";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { addAvailabilityException, getAvailableSlots, readAvailability, saveAvailability } from "./availability.service";
import { isTimeZone } from "./time";

export const availabilityRouter = Router();
availabilityRouter.use(requireAuth, requireApproved);

availabilityRouter.get("/me", requireRole("mentor"), asyncHandler(async (req, res) => {
  res.json(availabilityResponseSchema.parse(await readAvailability(req.auth!.userId)));
}));

availabilityRouter.put("/me", requireRole("mentor"), validate({ body: availabilityUpdateSchema }), asyncHandler(async (req, res) => {
  const data = await saveAvailability(req.auth!.userId, availabilityUpdateSchema.parse(req.body));
  res.json(availabilityResponseSchema.parse(data));
}));

availabilityRouter.post("/me/exceptions", requireRole("mentor"), validate({ body: availabilityExceptionInputSchema }), asyncHandler(async (req, res) => {
  const input = availabilityExceptionInputSchema.parse(req.body);
  const exception = await addAvailabilityException(req.auth!.userId, new Date(input.startsAt), new Date(input.endsAt));
  res.status(201).json(exception);
}));

availabilityRouter.delete("/me/exceptions/:exceptionId", requireRole("mentor"), asyncHandler(async (req, res) => {
  const result = await db.delete(availabilityExceptions).where(and(
    eq(availabilityExceptions.id, req.params.exceptionId!),
    eq(availabilityExceptions.mentorId, req.auth!.userId),
  )).returning({ id: availabilityExceptions.id });
  if (!result.length) throw new NotFoundError("Availability exception not found");
  res.status(204).end();
}));

const slotQuery = (value: z.infer<typeof slotRangeQuerySchema>) => {
  const query = value;
  const from = new Date(query.from); const to = new Date(query.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 14 * 86_400_000) throw new ConflictError("Choose a valid range up to 14 days");
  if (!isTimeZone(query.timezone)) throw new ConflictError("Choose a valid IANA timezone");
  return { from, to, timezone: query.timezone };
};

/** Availability is visible only to an active participant in an accepted connection. */
availabilityRouter.get("/connections/:connectionId/slots", requireRole("founder", "mentor"), validate({ query: slotRangeQuerySchema }), asyncHandler(async (req, res) => {
  const { from, to, timezone } = slotQuery(slotRangeQuerySchema.parse(req.query));
  const result = await pool.query<{ mentor_id: string }>(
    `SELECT connection.mentor_id FROM connections connection
     JOIN startups startup ON startup.id=connection.startup_id
     WHERE connection.id=$1 AND connection.state='accepted'
       AND ((startup.founder_id=$2 AND $3='founder') OR (connection.mentor_id=$2 AND $3='mentor'))`,
    [req.params.connectionId, req.auth!.userId, req.auth!.role],
  );
  const mentorId = result.rows[0]?.mentor_id;
  if (!mentorId) throw new ForbiddenError("Available times require an accepted connection", "CONNECTION_REQUIRED");
  const slots = await getAvailableSlots(mentorId, from, to);
  res.json(availableSlotsResponseSchema.parse({ timezone, slots }));
}));

