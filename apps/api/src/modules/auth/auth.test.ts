import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSchema } from "@mentorloop/shared";

const signup = (role: "founder" | "mentor", email: string) =>
  registerSchema.safeParse({
    fullName: "Test User",
    email,
    password: "correct-horse-42",
    role,
  });

test("founder signup requires an exact KIIT email and reports the email field", () => {
  const invalid = signup("founder", "founder@example.com");
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.deepEqual(invalid.error.issues.map(({ path, message }) => ({ path, message })), [
      { path: ["email"], message: "Founder accounts require an @kiit.ac.in email" },
    ]);
  }

  assert.equal(signup("founder", "founder@kiit.ac.in").success, true);
  assert.equal(signup("founder", "founder@sub.kiit.ac.in").success, false);
});

test("mentor signup continues to accept non-KIIT email addresses", () => {
  assert.equal(signup("mentor", "mentor@example.com").success, true);
});
