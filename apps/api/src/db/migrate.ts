import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { db, pool } from "./client";

const REQUIRED_EXTENSIONS = ["vector", "btree_gist", "pgcrypto"] as const;

async function main() {
  for (const ext of REQUIRED_EXTENSIONS) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
  }

  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });

  const { rows } = await pool.query<{ extname: string; extversion: string }>(
    "SELECT extname, extversion FROM pg_extension WHERE extname = ANY($1) ORDER BY extname",
    [REQUIRED_EXTENSIONS as unknown as string[]],
  );
  console.log("Migrations applied. Active extensions:");
  for (const r of rows) console.log(`  - ${r.extname} ${r.extversion}`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());