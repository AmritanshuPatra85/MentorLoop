import { z } from "zod";

export const taxonomyDomainSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type TaxonomyDomain = z.infer<typeof taxonomyDomainSchema>;

export const taxonomySkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type TaxonomySkill = z.infer<typeof taxonomySkillSchema>;

export const taxonomyStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  displayOrder: z.number().int(),
  description: z.string(),
});
export type TaxonomyStage = z.infer<typeof taxonomyStageSchema>;

export const taxonomyResponseSchema = z.object({
  domains: z.array(taxonomyDomainSchema),
  skills: z.array(taxonomySkillSchema),
  stages: z.array(taxonomyStageSchema),
});
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>;
