import { db, pool } from "./apps/api/src/db/client";
import { users } from "./apps/api/src/db/schema/users";

async function verifyAll() {
  await db.update(users).set({ emailVerified: true });
  console.log("✅ All users have been successfully verified in the database.");
  pool.end();
}

verifyAll();
