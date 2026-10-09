import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { domains, skills, stages } from "../../db/schema/taxonomy";
import { redis } from "../../lib/redis";

const CACHE_KEY_DOMAINS = "taxonomy:domains";
const CACHE_KEY_SKILLS = "taxonomy:skills";
const CACHE_KEY_STAGES = "taxonomy:stages";
const CACHE_TTL_SECONDS = 3600; // 1 hour

export const taxonomyService = {
  async getDomains() {
    const cached = await redis.get(CACHE_KEY_DOMAINS);
    if (cached) return JSON.parse(cached);

    const result = await db.select().from(domains).orderBy(asc(domains.name));
    
    // We omit createdAt from the API response
    const mapped = result.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
    
    await redis.set(CACHE_KEY_DOMAINS, JSON.stringify(mapped), "EX", CACHE_TTL_SECONDS);
    return mapped;
  },

  async getSkills() {
    const cached = await redis.get(CACHE_KEY_SKILLS);
    if (cached) return JSON.parse(cached);

    const result = await db.select().from(skills).orderBy(asc(skills.name));
    
    const mapped = result.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
    
    await redis.set(CACHE_KEY_SKILLS, JSON.stringify(mapped), "EX", CACHE_TTL_SECONDS);
    return mapped;
  },

  async getStages() {
    const cached = await redis.get(CACHE_KEY_STAGES);
    if (cached) return JSON.parse(cached);

    const result = await db.select().from(stages).orderBy(asc(stages.displayOrder));
    
    const mapped = result.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      displayOrder: r.displayOrder,
      description: r.description,
    }));
    
    await redis.set(CACHE_KEY_STAGES, JSON.stringify(mapped), "EX", CACHE_TTL_SECONDS);
    return mapped;
  },
};
