import type { Db } from "../client";
import { domains, skills, stages } from "../schema/taxonomy";

const DOMAINS_SEED = [
  { name: "AI & Machine Learning", slug: "ai-ml" },
  { name: "Fintech", slug: "fintech" },
  { name: "Healthtech", slug: "healthtech" },
  { name: "Edtech", slug: "edtech" },
  { name: "SaaS", slug: "saas" },
  { name: "D2C", slug: "d2c" },
  { name: "Deeptech", slug: "deeptech" },
  { name: "Web3 & Crypto", slug: "web3" },
  { name: "E-commerce", slug: "ecommerce" },
  { name: "Cleantech", slug: "cleantech" },
];

const SKILLS_SEED = [
  { name: "Fundraising", slug: "fundraising" },
  { name: "Go-to-Market Strategy", slug: "go-to-market" },
  { name: "Product Management", slug: "product-management" },
  { name: "Engineering & Architecture", slug: "engineering" },
  { name: "UI/UX Design", slug: "design" },
  { name: "B2B Sales", slug: "b2b-sales" },
  { name: "Marketing & Growth", slug: "marketing" },
  { name: "Operations & Scaling", slug: "operations" },
  { name: "Legal & Compliance", slug: "legal" },
];

const STAGES_SEED = [
  {
    name: "Idea",
    slug: "idea",
    displayOrder: 0,
    description: "Just a concept, no product yet",
  },
  {
    name: "Prototype",
    slug: "prototype",
    displayOrder: 1,
    description: "Building the first version",
  },
  {
    name: "MVP",
    slug: "mvp",
    displayOrder: 2,
    description: "Live product with early users",
  },
  {
    name: "Early Traction",
    slug: "early-traction",
    displayOrder: 3,
    description: "Consistent revenue or user growth",
  },
  {
    name: "Growth",
    slug: "growth",
    displayOrder: 4,
    description: "Scaling up operations and team",
  },
];

export async function runTaxonomySeeder(db: Db) {
  await db.insert(domains).values(DOMAINS_SEED).onConflictDoNothing({ target: domains.slug });
  await db.insert(skills).values(SKILLS_SEED).onConflictDoNothing({ target: skills.slug });
  await db.insert(stages).values(STAGES_SEED).onConflictDoNothing({ target: stages.slug });
}

export const taxonomySeeder = {
  name: "Taxonomy (Domains, Skills, Stages)",
  run: runTaxonomySeeder,
};
