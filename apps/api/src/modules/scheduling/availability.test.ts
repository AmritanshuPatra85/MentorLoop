import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db/client";
import { mentorProfiles, users } from "../../db/schema";
import { redis } from "../../lib/redis";
import { enqueueProfileEmbedding } from "../embeddings/embedding.queue";
import { saveAvailability } from "./availability.service";

vi.mock("../embeddings/embedding.queue", () => ({ enqueueProfileEmbedding: vi.fn() }));

const enqueueMock = vi.mocked(enqueueProfileEmbedding);
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let mentorId = "";

const validInput = {
  timezone: "Asia/Kolkata",
  sessionLengthMinutes: 30,
  bufferMinutes: 5,
  minimumNoticeMinutes: 60,
  rules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
};

beforeAll(async () => {
  const [mentor] = await db
    .insert(users)
    .values({
      email: `availability-${unique}@example.test`,
      fullName: "Availability Mentor",
      role: "mentor",
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  mentorId = mentor!.id;
  await db.insert(mentorProfiles).values({
    userId: mentorId,
    isComplete: true,
    timezone: "UTC",
    sessionLengthMinutes: 30,
  });
});

afterAll(async () => {
  if (mentorId) await db.delete(users).where(eq(users.id, mentorId));
  await Promise.allSettled([pool.end(), redis.quit()]);
});

describe("saveAvailability embedding refresh", () => {
  it("enqueues exactly one mentor embedding job after saving", async () => {
    enqueueMock.mockClear();
    const availability = await saveAvailability(mentorId, validInput);
    expect(availability.timezone).toBe("Asia/Kolkata");
    expect(availability.sessionLengthMinutes).toBe(30);
    expect(availability.rules).toHaveLength(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({ profileType: "mentor", profileId: mentorId });
  });

  it("queues nothing when the timezone is invalid", async () => {
    enqueueMock.mockClear();
    await expect(
      saveAvailability(mentorId, { ...validInput, timezone: "Not/AZone" }),
    ).rejects.toThrow("Choose a valid IANA timezone");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("queues nothing when the mentor profile is missing", async () => {
    enqueueMock.mockClear();
    await expect(saveAvailability(randomUUID(), validInput)).rejects.toThrow(
      "Mentor profile not found",
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
