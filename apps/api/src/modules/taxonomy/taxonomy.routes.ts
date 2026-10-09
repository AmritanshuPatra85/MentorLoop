import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { taxonomyService } from "./taxonomy.service";

export const taxonomyRouter = Router();

taxonomyRouter.get(
  "/domains",
  asyncHandler(async (_req, res) => {
    const domains = await taxonomyService.getDomains();
    res.json(domains);
  })
);

taxonomyRouter.get(
  "/skills",
  asyncHandler(async (_req, res) => {
    const skills = await taxonomyService.getSkills();
    res.json(skills);
  })
);

taxonomyRouter.get(
  "/stages",
  asyncHandler(async (_req, res) => {
    const stages = await taxonomyService.getStages();
    res.json(stages);
  })
);
