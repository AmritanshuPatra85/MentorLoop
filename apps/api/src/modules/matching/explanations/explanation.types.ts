import type { MatchResult } from "@mentorloop/shared";

export type MatchExplanationFacts = {
  mentorName: string;
  currentRole: string | null;
  organization: string | null;
  yearsExperience: number | null;
  overlappingDomains: string[];
  startupStages: string[];
  mentorStages: string[];
  hasAvailabilityPreferences: boolean;
};

export type MatchExplanationJobData = {
  startupId: string;
  mentorId: string;
  startupContentHash: string;
  mentorContentHash: string;
  facts: MatchExplanationFacts;
  signals: MatchResult["signals"];
};

export type MatchExplanationCacheRow = {
  explanation: string;
  source: "groq" | "template";
  model: string | null;
};
