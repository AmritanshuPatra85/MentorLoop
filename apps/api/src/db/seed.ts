import { db, pool } from "./client";
import { seeders } from "./seeds";

async function main() {
  if (seeders.length === 0) {
    console.log("No seeders registered yet.");
    return;
  }
  for (const seeder of seeders) {
    console.log(`Seeding: ${seeder.name}`);
    await seeder.run(db);
  }
  console.log("Seeding complete.");
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());