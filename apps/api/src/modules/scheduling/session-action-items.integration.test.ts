import express, { Router } from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionActionItemProposal } from "@mentorloop/shared";
import { db, pool } from "../../db/client";
import { connections, mentorProfiles, startups, users } from "../../db/schema";
import { errorHandler } from "../../middleware/error-handler";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { signAccessToken } from "../auth/tokens";
import { createSessionActionItemsRouter } from "./session-action-items.routes";
import { connectionActionItemsRouter } from "./connection-action-items.routes";
import { getSessionActionItemsContext, listSessionActionItems, saveSessionActionItems, updateSessionActionItem } from "./session-action-items.repository";

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const extractedItem: SessionActionItemProposal = {
  title: "Share the pilot results",
  description: "Include activation and retention findings.",
  owner: "founder",
  dueDate: "2026-10-15",
  priority: "high",
  sourceText: "I will share the pilot results by October 15.",
};

let server: Server | undefined;
let baseUrl = "";
let founderId = "";
let mentorId = "";
let outsiderId = "";
let emptyFounderId = "";
let sessionId = "";
let connectionId = "";
let emptyConnectionId = "";
let founderToken = "";
let mentorToken = "";
let outsiderToken = "";
let emptyFounderToken = "";
const extract = vi.fn(async (_notes: string, _context: unknown) => [extractedItem]);

beforeAll(async () => {
  const insertedUsers = await db.insert(users).values([
    { email: `action-founder-${unique}@example.test`, fullName: "Action Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `action-mentor-${unique}@example.test`, fullName: "Action Mentor", role: "mentor", status: "active", emailVerifiedAt: new Date() },
    { email: `action-outsider-${unique}@example.test`, fullName: "Action Outsider", role: "founder", status: "active", emailVerifiedAt: new Date() },
    { email: `action-empty-founder-${unique}@example.test`, fullName: "Empty Action Founder", role: "founder", status: "active", emailVerifiedAt: new Date() },
  ]).returning({ id: users.id });
  founderId = insertedUsers[0]!.id; mentorId = insertedUsers[1]!.id; outsiderId = insertedUsers[2]!.id; emptyFounderId = insertedUsers[3]!.id;
  founderToken = await signAccessToken({ id: founderId, role: "founder" });
  mentorToken = await signAccessToken({ id: mentorId, role: "mentor" });
  outsiderToken = await signAccessToken({ id: outsiderId, role: "founder" });
  emptyFounderToken = await signAccessToken({ id: emptyFounderId, role: "founder" });

  const [startup] = await db.insert(startups).values({
    founderId, name: `Action Startup ${unique}`, oneLiner: "Action item integration fixture",
    description: "Fixture startup for action item tests.", isComplete: true, timezone: "UTC", preferredSessionTimes: [],
  }).returning({ id: startups.id });
  await db.insert(mentorProfiles).values({
    userId: mentorId, currentRole: "Business mentor", organization: "Action Test Org", bio: "Test mentor profile.",
    isComplete: true, maxMentees: 3, sessionLengthMinutes: 30, timezone: "UTC",
  });
  const [connection] = await db.insert(connections).values({
    startupId: startup!.id, mentorId, initiatedBy: founderId, state: "accepted", respondedAt: new Date(),
  }).returning({ id: connections.id });
  connectionId = connection!.id;
  const [emptyStartup] = await db.insert(startups).values({
    founderId: emptyFounderId, name: `Empty Action Startup ${unique}`, oneLiner: "No action items yet",
    description: "Empty connection progress fixture.", isComplete: true, timezone: "UTC", preferredSessionTimes: [],
  }).returning({ id: startups.id });
  const [emptyConnection] = await db.insert(connections).values({
    startupId: emptyStartup!.id, mentorId, initiatedBy: founderId, state: "accepted", respondedAt: new Date(),
  }).returning({ id: connections.id });
  emptyConnectionId = emptyConnection!.id;
  const now = Date.now();
  const insertedSession = await pool.query<{ id: string }>(
    `INSERT INTO sessions(connection_id,mentor_id,startup_id,time_range,status)
     VALUES ($1,$2,$3,tstzrange($4,$5,'[)'),'completed') RETURNING id`,
    [connection!.id, mentorId, startup!.id, new Date(now - 86_400_000), new Date(now - 86_400_000 + 1_800_000)],
  );
  sessionId = insertedSession.rows[0]!.id;

  const app = express(); app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => { Object.assign(req, { log: { error: console.error, warn: console.warn, info: console.info } }); next(); });
  const sessions = Router();
  sessions.use(requireAuth, requireApproved, requireRole("founder", "mentor"));
  sessions.use("/:sessionId/action-items", createSessionActionItemsRouter({
    getContext: getSessionActionItemsContext,
    list: listSessionActionItems,
    update: updateSessionActionItem,
    save: saveSessionActionItems,
    extract,
  }));
  const connectionItems = Router({ mergeParams: true });
  connectionItems.use(requireAuth, requireApproved, requireRole("founder", "mentor"), connectionActionItemsRouter);
  app.use("/connections/:connectionId/action-items", connectionItems);
  app.use("/sessions", sessions); app.use(errorHandler);
  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      server = listener;
      const address = listener.address();
      if (!address || typeof address === "string") return reject(new Error("Could not start action item API test server"));
      baseUrl = `http://127.0.0.1:${address.port}`; resolve();
    });
    listener.once("error", reject);
  });
});

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
  const ids = [founderId, mentorId, outsiderId, emptyFounderId].filter(Boolean);
  if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  await pool.end();
});

const authorized = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const endpoint = (path = "") => `${baseUrl}/sessions/${sessionId}/action-items${path}`;
const saveBody = (submissionId: string, actionItems: unknown[] = [{ title: "Send the pilot results", description: null, owner: "founder", dueDate: "2026-10-15", priority: "high" }]) => ({ submissionId, actionItems });

describe("session action item routes", () => {
  it("requires an authenticated session participant to read, extract, or save", async () => {
    expect((await fetch(endpoint())).status).toBe(401);
    expect((await fetch(endpoint(), { headers: { Authorization: `Bearer ${outsiderToken}` } })).status).toBe(404);
    expect((await fetch(endpoint("/extract"), { method: "POST", headers: authorized(outsiderToken), body: JSON.stringify({ notes: "A private note." }) })).status).toBe(404);
    expect((await fetch(endpoint(), { method: "POST", headers: authorized(outsiderToken), body: JSON.stringify(saveBody(crypto.randomUUID())) })).status).toBe(404);
  });

  it("validates notes, returns mock extraction proposals, and never persists extraction alone", async () => {
    expect((await fetch(endpoint("/extract"), { method: "POST", headers: authorized(founderToken), body: JSON.stringify({ notes: "   " }) })).status).toBe(400);
    expect((await fetch(endpoint("/extract"), { method: "POST", headers: authorized(founderToken), body: JSON.stringify({ notes: "x".repeat(16001) }) })).status).toBe(400);
    const response = await fetch(endpoint("/extract"), { method: "POST", headers: authorized(mentorToken), body: JSON.stringify({ notes: "I will share the pilot results by October 15." }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actionItems: [extractedItem] });
    expect(extract).toHaveBeenCalledWith("I will share the pilot results by October 15.", expect.objectContaining({ sessionDate: expect.any(String), timezone: "UTC" }));
    const listing = await fetch(endpoint(), { headers: { Authorization: `Bearer ${founderToken}` } });
    expect((await listing.json()).actionItems).toEqual([]);
  });

  it("saves only reviewed fields transactionally, attributes the authenticated creator, and deduplicates retries", async () => {
    const submissionId = crypto.randomUUID();
    const reviewed = [{ title: "Edited: send pilot results", description: "Include activation data.", owner: "shared", dueDate: "2026-10-20", priority: "medium" }];
    const first = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify(saveBody(submissionId, reviewed)) });
    const firstText = await first.text();
    let firstResponse: { actionItems?: unknown[] } | string;
    try { firstResponse = JSON.parse(firstText) as { actionItems?: unknown[] }; } catch { firstResponse = firstText; }
    expect(first.status, JSON.stringify(firstResponse)).toBe(201);
    const firstRows = typeof firstResponse === "object" && firstResponse !== null && Array.isArray(firstResponse.actionItems) ? firstResponse.actionItems : [];
    expect(firstRows).toHaveLength(1);
    expect(firstRows[0]).toMatchObject({ sessionId, createdBy: founderId, submissionId, title: "Edited: send pilot results", owner: "shared", dueDate: "2026-10-20", priority: "medium", status: "open" });
    expect(firstRows[0]).not.toHaveProperty("sourceText");

    const retry = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify(saveBody(submissionId, reviewed)) });
    expect(retry.status).toBe(201);
    expect((await retry.json()).actionItems).toEqual(firstRows);

    const founderList = await fetch(endpoint(), { headers: { Authorization: `Bearer ${founderToken}` } });
    const mentorList = await fetch(endpoint(), { headers: { Authorization: `Bearer ${mentorToken}` } });
    expect((await founderList.json()).actionItems).toEqual(firstRows);
    expect((await mentorList.json()).actionItems).toEqual(firstRows);

    const invalid = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify({ ...saveBody(crypto.randomUUID()), createdBy: outsiderId }) });
    expect(invalid.status).toBe(400);
  });

  it("returns not found for invalid session IDs and validates saved dates", async () => {
    const invalidSession = await fetch(`${baseUrl}/sessions/${crypto.randomUUID()}/action-items`, { headers: { Authorization: `Bearer ${founderToken}` } });
    expect(invalidSession.status).toBe(404);
    const invalidDate = await fetch(endpoint(), { method: "POST", headers: authorized(mentorToken), body: JSON.stringify(saveBody(crypto.randomUUID(), [{ title: "Valid task", description: null, owner: "mentor", dueDate: "2026-02-30", priority: "high" }])) });
    expect(invalidDate.status).toBe(400);
  });

  it("lets both participants update shared status and due fields with optimistic concurrency", async () => {
    const submissionId = crypto.randomUUID();
    const saved = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify(saveBody(submissionId)) });
    const [item] = (await saved.json()).actionItems;
    const competing = await Promise.all([
      fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(mentorToken), body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status: "in_progress", owner: "mentor" }) }),
      fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status: "blocked" }) }),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);
    const winningResponse = competing.find((response) => response.status === 200)!;
    let updated = await winningResponse.json();
    expect(["in_progress", "blocked"]).toContain(updated.status);
    const yesterday = await pool.query<{ value: string }>("SELECT (CURRENT_DATE - 1)::text AS value");
    const overdueResponse = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, dueDate: yesterday.rows[0]!.value }) });
    expect(overdueResponse.status).toBe(200);
    updated = await overdueResponse.json();
    expect(updated.overdue).toBe(true);
    const overdueItems = (await fetch(endpoint("?overdue=true"), { headers: { Authorization: `Bearer ${founderToken}` } }).then((r) => r.json())).actionItems as Array<{ id: string }>;
    expect(overdueItems.some((overdueItem) => overdueItem.id === item.id)).toBe(true);
    const ownerUpdate = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, owner: "mentor" }) });
    updated = await ownerUpdate.json();
    const mentorItems = (await fetch(endpoint("?owner=mentor"), { headers: { Authorization: `Bearer ${mentorToken}` } }).then((r) => r.json())).actionItems as Array<{ id: string }>;
    expect(mentorItems.some((mentorItem) => mentorItem.id === item.id)).toBe(true);
    const openItems = (await fetch(endpoint("?status=open"), { headers: { Authorization: `Bearer ${founderToken}` } }).then((r) => r.json())).actionItems as Array<{ id: string }>;
    expect(openItems.some((openItem) => openItem.id === item.id)).toBe(false);
    const stale = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status: "done" }) });
    expect(stale.status).toBe(409);
    const outsider = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(outsiderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, status: "done" }) });
    expect(outsider.status).toBe(404);
    const invalid = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, status: "cancelled" }) });
    expect(invalid.status).toBe(400);
    const invalidDate = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, dueDate: "2026-02-30" }) });
    expect(invalidDate.status).toBe(400);
    const done = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(founderToken), body: JSON.stringify({ expectedUpdatedAt: updated.updatedAt, status: "done" }) });
    expect((await done.json()).overdue).toBe(false);
    const notOverdue = (await fetch(endpoint("?status=done&overdue=false"), { headers: { Authorization: `Bearer ${founderToken}` } }).then((r) => r.json())).actionItems as Array<{ id: string }>;
    expect(notOverdue.some((candidate) => candidate.id === item.id)).toBe(true);
  });

  it("returns connection-wide persisted progress and zero-safe summary to both participants", async () => {
    await pool.query("DELETE FROM session_action_items WHERE session_id=$1", [sessionId]);
    const empty = await fetch(`${baseUrl}/connections/${emptyConnectionId}/action-items`, { headers: { Authorization: `Bearer ${emptyFounderToken}` } });
    expect(empty.status).toBe(200);
    expect((await empty.json()).summary).toMatchObject({ total: 0, completionPercentage: 0 });
    const submissionId = crypto.randomUUID();
    const saved = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify(saveBody(submissionId)) });
    const [item] = (await saved.json()).actionItems;
    const changed = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(mentorToken), body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status: "done" }) });
    const done = await changed.json();
    expect(done.overdue).toBe(false);
    const response = await fetch(`${baseUrl}/connections/${connectionId}/action-items`, { headers: { Authorization: `Bearer ${mentorToken}` } });
    const data = await response.json();
    expect(data.actionItems[0]).toMatchObject({ status: "done", overdue: false });
    expect(data.summary).toMatchObject({ total: 1, done: 1, overdue: 0, completionPercentage: 100 });
    expect((await fetch(`${baseUrl}/connections/${connectionId}/action-items`, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status).toBe(404);
  });

  it("returns a safe server error on a database update failure without changing the item", async () => {
    const submissionId = crypto.randomUUID();
    const saved = await fetch(endpoint(), { method: "POST", headers: authorized(founderToken), body: JSON.stringify(saveBody(submissionId)) });
    const [item] = (await saved.json()).actionItems;
    const querySpy = vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("simulated database outage"));
    const failed = await fetch(endpoint(`/${item.id}`), { method: "PATCH", headers: authorized(mentorToken), body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status: "done" }) });
    querySpy.mockRestore();
    expect(failed.status).toBe(500);
    const current = await fetch(endpoint(), { headers: { Authorization: `Bearer ${founderToken}` } });
    expect((await current.json()).actionItems.find((row: { id: string }) => row.id === item.id).status).toBe("open");
  });
});
