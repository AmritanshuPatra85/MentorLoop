/** Profiles below this score should receive an owner-facing match-quality warning. */
export const THIN_PROFILE_THRESHOLD = 40;

export type CompletenessProfileType = "founder" | "startup" | "mentor";
export type CompletenessDestination = { href: string; anchor: string };
export type CompletenessItem = {
  id: string;
  label: string;
  completed: boolean;
  weight: number;
  destination: CompletenessDestination;
};
export type ProfileCompletenessReport = {
  profileType: CompletenessProfileType;
  score: number;
  completedCount: number;
  totalCount: number;
  items: CompletenessItem[];
  missingItems: CompletenessItem[];
  isThinProfile: boolean;
};

type FounderCompletenessInput = {
  founderTitle?: unknown;
  linkedinUrl?: unknown;
};
type StartupCompletenessInput = {
  startupName?: unknown;
  oneLiner?: unknown;
  description?: unknown;
  domainSlugs?: unknown;
  primaryDomainSlug?: unknown;
  stageSlug?: unknown;
  helpNeeded?: unknown;
  goals?: unknown;
  timezone?: unknown;
  preferredSessionTimes?: unknown;
};
type MentorCompletenessInput = {
  currentRole?: unknown;
  organization?: unknown;
  bio?: unknown;
  experienceSummary?: unknown;
  domainSlugs?: unknown;
  skillSlugs?: unknown;
  stageSlugs?: unknown;
  helpTopics?: unknown;
  yearsExperience?: unknown;
  maxMentees?: unknown;
  timezone?: unknown;
  preferredSessionTimes?: unknown;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasSelection(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => hasText(item));
}

function hasAvailability(profile: {
  timezone?: unknown;
  preferredSessionTimes?: unknown;
}): boolean {
  return (
    hasText(profile.timezone) &&
    Array.isArray(profile.preferredSessionTimes) &&
    profile.preferredSessionTimes.length > 0
  );
}

function report(
  profileType: CompletenessProfileType,
  definitions: Array<Omit<CompletenessItem, "completed"> & { completed: boolean }>,
): ProfileCompletenessReport {
  const items = definitions.map((item) => ({ ...item }));
  const score = Math.max(
    0,
    Math.min(
      100,
      items.reduce((sum, item) => sum + (item.completed ? item.weight : 0), 0),
    ),
  );
  const missingItems = items.filter((item) => !item.completed);
  return {
    profileType,
    score,
    completedCount: items.length - missingItems.length,
    totalCount: items.length,
    items,
    missingItems,
    isThinProfile: profileType !== "founder" && score < THIN_PROFILE_THRESHOLD,
  };
}

function item(
  id: string,
  label: string,
  weight: number,
  anchor: string,
  completed: boolean,
): CompletenessItem {
  return {
    id,
    label,
    weight,
    completed,
    destination: { href: `/profile#${anchor}`, anchor },
  };
}

/** Founder identity/professional details; startup matching fields are scored separately. */
export function scoreFounderProfile(
  profile: FounderCompletenessInput | null | undefined,
): ProfileCompletenessReport {
  const value = profile ?? {};
  return report("founder", [
    item(
      "founder-title",
      "Add your founder role",
      50,
      "founderTitle",
      hasText(value.founderTitle),
    ),
    item(
      "founder-linkedin",
      "Add your LinkedIn profile",
      50,
      "linkedinUrl",
      hasText(value.linkedinUrl),
    ),
  ]);
}

/** Startup matching completeness. Weights total 100; each concept appears once. */
export function scoreStartupProfile(
  profile: StartupCompletenessInput | null | undefined,
): ProfileCompletenessReport {
  const value = profile ?? {};
  const domains = hasSelection(value.domainSlugs) && hasText(value.primaryDomainSlug);
  return report("startup", [
    item(
      "startup-name",
      "Add your startup name",
      14,
      "startupName",
      hasText(value.startupName),
    ),
    item(
      "startup-pitch",
      "Write a one-line pitch",
      14,
      "oneLiner",
      hasText(value.oneLiner),
    ),
    item(
      "startup-description",
      "Describe what you are building",
      14,
      "description",
      hasText(value.description),
    ),
    item(
      "startup-domains",
      "Choose domains and a primary domain",
      14,
      "domainSlugs",
      domains,
    ),
    item(
      "startup-stage",
      "Set your startup stage",
      10,
      "stageSlug",
      hasText(value.stageSlug),
    ),
    item(
      "startup-mentorship-needs",
      "Describe the help you need",
      14,
      "helpNeeded",
      hasText(value.helpNeeded),
    ),
    item("startup-goals", "Add a near-term goal", 10, "goals", hasText(value.goals)),
    item(
      "startup-availability",
      "Set your timezone and preferred times",
      10,
      "preferredSessionTimes",
      hasAvailability(value),
    ),
  ]);
}

/** Mentor matching completeness. Years of experience accepts zero as a valid value. */
export function scoreMentorProfile(
  profile: MentorCompletenessInput | null | undefined,
): ProfileCompletenessReport {
  const value = profile ?? {};
  const roleOrOrganization = hasText(value.currentRole) || hasText(value.organization);
  const years =
    typeof value.yearsExperience === "number" &&
    Number.isFinite(value.yearsExperience) &&
    value.yearsExperience >= 0;
  const menteeCapacity =
    typeof value.maxMentees === "number" &&
    Number.isInteger(value.maxMentees) &&
    value.maxMentees >= 1;
  return report("mentor", [
    item("mentor-bio", "Add a professional bio", 16, "bio", hasText(value.bio)),
    item(
      "mentor-experience",
      "Describe your experience",
      13,
      "experienceSummary",
      hasText(value.experienceSummary),
    ),
    item(
      "mentor-role",
      "Add your current role or organization",
      9,
      "currentRole",
      roleOrOrganization,
    ),
    item(
      "mentor-domains",
      "Choose your expertise domains",
      14,
      "domainSlugs",
      hasSelection(value.domainSlugs),
    ),
    item(
      "mentor-skills",
      "Choose skills you can offer",
      14,
      "skillSlugs",
      hasSelection(value.skillSlugs),
    ),
    item(
      "mentor-stages",
      "Choose startup stages you can mentor",
      10,
      "stageSlugs",
      hasSelection(value.stageSlugs),
    ),
    item(
      "mentor-topics",
      "Add mentorship topics",
      10,
      "helpTopics",
      hasText(value.helpTopics),
    ),
    item(
      "mentor-years",
      "Add years of experience (zero is okay)",
      5,
      "yearsExperience",
      years,
    ),
    item("mentor-capacity", "Set your mentee capacity", 4, "maxMentees", menteeCapacity),
    item(
      "mentor-availability",
      "Set your timezone and preferred times",
      5,
      "preferredSessionTimes",
      hasAvailability(value),
    ),
  ]);
}

export function isThinProfileScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score < THIN_PROFILE_THRESHOLD;
}
