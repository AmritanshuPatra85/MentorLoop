import assert from "node:assert/strict";
import { test } from "node:test";
import { isTimeZone, localDateKey, localDateTimeToInstant, nextDateKey, weekdayForDateKey } from "./time";

test("local recurring availability resolves across seasonal timezone offsets", () => {
  const winter = localDateTimeToInstant("2026-01-12", "09:30", "Europe/Prague");
  const summer = localDateTimeToInstant("2026-07-13", "09:30", "Europe/Prague");
  assert.equal(winter?.toISOString(), "2026-01-12T08:30:00.000Z");
  assert.equal(summer?.toISOString(), "2026-07-13T07:30:00.000Z");
});

test("DST gaps are skipped and repeated wall times resolve deterministically", () => {
  assert.equal(localDateTimeToInstant("2026-03-29", "02:30", "Europe/Prague"), null);
  assert.equal(localDateTimeToInstant("2026-10-25", "02:30", "Europe/Prague")?.toISOString(), "2026-10-25T00:30:00.000Z");
});

test("timezone and calendar date helpers validate and increment local dates", () => {
  assert.equal(isTimeZone("America/Los_Angeles"), true);
  assert.equal(isTimeZone("Not/AZone"), false);
  assert.equal(localDateKey(new Date("2026-01-12T08:30:00.000Z"), "Europe/Prague"), "2026-01-12");
  assert.equal(weekdayForDateKey("2026-01-12"), 1);
  assert.equal(nextDateKey("2026-01-31"), "2026-02-01");
});
