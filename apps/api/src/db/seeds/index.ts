import type { Db } from "../client";

export type Seeder = {
  name: string;
  run: (db: Db) => Promise<void>;
};

import { taxonomySeeder } from "./taxonomy.seeder";

// Later sprints register their seeders here (taxonomy in 2.4, demo data in 9.3).
export const seeders: Seeder[] = [taxonomySeeder];