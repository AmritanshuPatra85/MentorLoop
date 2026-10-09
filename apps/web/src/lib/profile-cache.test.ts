import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProfileOptimistically, rollbackProfile } from "./profile-cache";

test("profile cache applies optimistic fields and rolls back to the captured snapshot", () => {
  const before = {
    role: "founder" as const,
    avatarUrl: null,
    profile: { startupName: "Before", goals: "Original goals" },
  };
  const optimistic = mergeProfileOptimistically(before, { startupName: "After" });
  assert.deepEqual(optimistic.profile, { startupName: "After", goals: "Original goals" });
  assert.equal(rollbackProfile(before), before);
  assert.deepEqual(rollbackProfile(before)?.profile, {
    startupName: "Before",
    goals: "Original goals",
  });
});
