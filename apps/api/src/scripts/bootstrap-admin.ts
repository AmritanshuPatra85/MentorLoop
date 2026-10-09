import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import { emailSchema } from "@mentorloop/shared";
import { db, pool } from "../db/client";
import { users } from "../db/schema";
import { ConflictError, NotFoundError } from "../lib/errors";

/** Promote one explicitly named, existing, verified account. Never creates credentials or accounts. */
export async function bootstrapAdmin(configuredEmail: string) {
  const email = emailSchema.parse(configuredEmail);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .for("update")
      .limit(1);
    if (!user) throw new NotFoundError("No account exists for ADMIN_EMAIL");
    if (!user.emailVerifiedAt) {
      throw new ConflictError("The ADMIN_EMAIL account must verify its email first");
    }
    if (user.status === "suspended") {
      throw new ConflictError("A suspended account cannot be promoted to administrator");
    }
    if (user.role === "admin" && user.status === "active") return user;

    const [updated] = await tx
      .update(users)
      .set({
        role: "admin",
        status: "active",
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, role: users.role, status: users.status });
    if (!updated) throw new Error("Admin promotion did not update the account");
    return updated;
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  if (!email)
    throw new Error(
      "Set ADMIN_EMAIL to an existing, verified account before running this script",
    );
  const admin = await bootstrapAdmin(email);
  console.log(
    `Administrator ready: ${email} (${admin.id}). Sign out and sign back in to refresh the role.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Admin bootstrap failed");
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
