import type { MatchResult } from "@mentorloop/shared";
import type { MatchExplanationFacts } from "./explanation.types";

function cleanFact(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/[\r\n]+/g, " ").replace(/[.!?]+/g, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function stageDescription(score: number, facts: MatchExplanationFacts): string {
  const startup = facts.startupStages.map(cleanFact).filter(Boolean).join(", ");
  const mentor = facts.mentorStages.map(cleanFact).filter(Boolean).join(", ");
  if (score >= 0.9) return startup && mentor
    ? `the ${startup} stage matches the mentor's supported ${mentor} stage${facts.mentorStages.length === 1 ? "" : "s"}`
    : "the startup stage closely matches the mentor's supported stages";
  if (score >= 0.4) return startup && mentor
    ? `the ${startup} stage is adjacent to the mentor's supported ${mentor} stage${facts.mentorStages.length === 1 ? "" : "s"}`
    : "the startup stage is adjacent to the mentor's supported stages";
  return startup && mentor
    ? `the ${startup} stage differs from the mentor's supported ${mentor} stages`
    : "the stage-fit signal is limited";
}

function availabilityDescription(score: number, hasPreferences: boolean): string {
  if (!hasPreferences) return "schedule alignment is neutral because no preferred session windows were provided";
  return `bookable availability overlaps ${Math.round(score * 100)}% of the preferred session windows`;
}

export function buildTemplateExplanation(
  facts: MatchExplanationFacts,
  signals: MatchResult["signals"],
): string {
  const name = cleanFact(facts.mentorName) ?? "This mentor";
  const role = cleanFact(facts.currentRole);
  const organization = cleanFact(facts.organization);
  const years = typeof facts.yearsExperience === "number" && Number.isFinite(facts.yearsExperience)
    ? `${facts.yearsExperience} years of experience`
    : undefined;
  const roleLine = [role, organization ? `at ${organization}` : undefined, years ? `with ${years}` : undefined]
    .filter(Boolean).join(" ");
  const firstSentence = role
    ? `${name} is ${roleLine}.`
    : organization
      ? `${name}'s profile lists ${organization}${years ? ` and ${years}` : ""}.`
      : years
        ? `${name} has ${years}.`
        : `${name} has no current role or organization listed in the profile.`;
  const domains = facts.overlappingDomains.map(cleanFact).filter((domain): domain is string => !!domain);
  const domainDescription = domains.length
    ? `shared domains include ${domains.join(", ")}`
    : `domain overlap scored ${Math.round(signals.domainOverlap.raw * 100)}%`;
  const trackRecord = signals.trackRecord.raw === 0.5
    ? "the track-record signal is neutral"
    : `the track-record signal scored ${Math.round(signals.trackRecord.raw * 100)}%`;
  return `${firstSentence} The score reflects ${Math.round(signals.semanticSimilarity.raw * 100)}% semantic similarity, ${domainDescription}, ${stageDescription(signals.stageFit.raw, facts)}, ${availabilityDescription(signals.availabilityOverlap.raw, facts.hasAvailabilityPreferences)}, and ${trackRecord}.`;
}
