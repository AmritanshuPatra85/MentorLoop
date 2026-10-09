export type StartupEmbeddingProfile = {
  name?: string | null;
  oneLiner?: string | null;
  description?: string | null;
  domainNames?: readonly (string | null | undefined)[] | null;
  stageName?: string | null;
  helpNeeded?: string | null;
  goals?: string | null;
};

export type MentorEmbeddingProfile = {
  currentRole?: string | null;
  organization?: string | null;
  bio?: string | null;
  experienceSummary?: string | null;
  yearsExperience?: number | null;
  domainNames?: readonly (string | null | undefined)[] | null;
  skillNames?: readonly (string | null | undefined)[] | null;
  mentorshipStageNames?: readonly (string | null | undefined)[] | null;
  helpTopics?: string | null;
};

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function cleanList(values: readonly (string | null | undefined)[] | null | undefined) {
  return [...new Set((values ?? []).map(clean).filter((value): value is string => !!value))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(", ") || undefined;
}

function format(fields: Array<[string, string | undefined]>) {
  return fields.filter((entry): entry is [string, string] => !!entry[1]).map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function buildStartupEmbeddingText(profile: StartupEmbeddingProfile): string {
  return format([
    ["Startup", clean(profile.name)],
    ["Pitch", clean(profile.oneLiner)],
    ["Description", clean(profile.description)],
    ["Domains", cleanList(profile.domainNames)],
    ["Stage", clean(profile.stageName)],
    ["Mentorship needs", clean(profile.helpNeeded)],
    ["Goals", clean(profile.goals)],
  ]);
}

export function buildMentorEmbeddingText(profile: MentorEmbeddingProfile): string {
  const years = typeof profile.yearsExperience === "number" && Number.isFinite(profile.yearsExperience) && profile.yearsExperience >= 0
    ? `${profile.yearsExperience} years`
    : undefined;
  return format([
    ["Role", clean(profile.currentRole)],
    ["Organization", clean(profile.organization)],
    ["Biography", clean(profile.bio)],
    ["Experience", clean(profile.experienceSummary)],
    ["Years of experience", years],
    ["Domains", cleanList(profile.domainNames)],
    ["Skills", cleanList(profile.skillNames)],
    ["Mentorship stages", cleanList(profile.mentorshipStageNames)],
    ["Mentorship topics", clean(profile.helpTopics)],
  ]);
}
