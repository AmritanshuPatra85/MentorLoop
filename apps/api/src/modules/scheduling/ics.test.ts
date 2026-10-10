import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalendarIcs } from "./sessions.routes";

test("calendar export contains absolute UTC times, participant details, meeting location, and escaped text", () => {
  const output = buildCalendarIcs({
    id: "c142deda-e2d3-4a3f-878d-27e2ed9d7642", connectionId: "7360de01-c0b6-4b7a-9f74-0b5cd720a892",
    mentorId: "5de60cd9-a3f3-44d0-b64b-3dc5174a9b40", startupId: "426e01e8-3fa8-4409-b54a-9ff83124fc58",
    status: "scheduled", startsAt: "2026-10-20T16:00:00.000Z", endsAt: "2026-10-20T16:30:00.000Z",
    mentorTimezone: "Asia/Kolkata", meetingUrl: "https://meet.example.test/a,b", startupName: "Acme, Inc; Labs",
    mentorName: "Mentor Example", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  });
  assert.match(output, /BEGIN:VCALENDAR\r\n/);
  assert.match(output, /DTSTART:20261020T160000Z/);
  assert.match(output, /DTEND:20261020T163000Z/);
  assert.match(output, /SUMMARY:MentorLoop: Acme\\, Inc\\; Labs/);
  assert.match(output, /LOCATION:https:\/\/meet\.example\.test\/a,b/);
  assert.ok(output.endsWith("END:VCALENDAR\r\n"));
});
