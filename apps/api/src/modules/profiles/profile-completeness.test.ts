import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isThinProfileScore,
  scoreFounderProfile,
  scoreMentorProfile,
  scoreStartupProfile,
  THIN_PROFILE_THRESHOLD,
} from "@mentorloop/shared";

test("empty profiles start at zero and expose every missing item", () => {
  for (const report of [
    scoreFounderProfile(null),
    scoreStartupProfile(null),
    scoreMentorProfile(null),
  ]) {
    assert.equal(report.score, 0);
    assert.equal(report.completedCount, 0);
    assert.equal(report.totalCount, report.items.length);
    assert.equal(report.missingItems.length, report.items.length);
  }
});

test("complete founder, startup, and mentor profiles score exactly 100", () => {
  assert.equal(
    scoreFounderProfile({
      founderTitle: "Founder",
      linkedinUrl: "https://linkedin.com/in/founder",
    }).score,
    100,
  );
  assert.equal(
    scoreStartupProfile({
      startupName: "Loop",
      oneLiner: "A startup",
      description: "We help founders",
      domainSlugs: ["fintech"],
      primaryDomainSlug: "fintech",
      stageSlug: "idea",
      helpNeeded: "Go to market",
      goals: "Launch",
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 1 }],
    }).score,
    100,
  );
  assert.equal(
    scoreMentorProfile({
      bio: "A helpful mentor",
      experienceSummary: "Built teams",
      currentRole: "CTO",
      domainSlugs: ["fintech"],
      skillSlugs: ["strategy"],
      stageSlugs: ["seed"],
      helpTopics: "Fundraising",
      yearsExperience: 0,
      maxMentees: 2,
      timezone: "Asia/Kolkata",
      preferredSessionTimes: [{ day: 1 }],
    }).score,
    100,
  );
});

test("whitespace, empty selections, and incomplete availability do not count", () => {
  const startup = scoreStartupProfile({
    startupName: "  ",
    domainSlugs: [],
    primaryDomainSlug: "",
    timezone: "Asia/Kolkata",
    preferredSessionTimes: [],
  });
  assert.equal(startup.completedCount, 0);
  const mentor = scoreMentorProfile({
    bio: "  ",
    domainSlugs: ["  "],
    skillSlugs: [],
    stageSlugs: [],
    timezone: "",
    preferredSessionTimes: [{ day: 1 }],
  });
  assert.equal(mentor.score, 0);
});

test("mentor role or organization and zero years of experience are valid", () => {
  assert.equal(
    scoreMentorProfile({ currentRole: " ", organization: "Acme", yearsExperience: 0 })
      .completedCount,
    2,
  );
});

test("reports are deterministic and checklist links target the profile fields", () => {
  const input = { domainSlugs: ["ai"], primaryDomainSlug: "ai" };
  const first = scoreStartupProfile(input);
  assert.deepEqual(scoreStartupProfile(input), first);
  assert.equal(
    first.items.find((item) => item.id === "startup-domains")?.destination.href,
    "/profile#domainSlugs",
  );
  assert.equal(
    scoreMentorProfile(null).items.find((item) => item.id === "mentor-availability")
      ?.destination.href,
    "/profile#preferredSessionTimes",
  );
});

test("thin-profile threshold is advisory below 40 and founder profiles do not trigger it", () => {
  assert.equal(THIN_PROFILE_THRESHOLD, 40);
  assert.equal(isThinProfileScore(39), true);
  assert.equal(isThinProfileScore(40), false);
  assert.equal(scoreStartupProfile({ startupName: "Name" }).isThinProfile, true);
  assert.equal(scoreMentorProfile({ bio: "Complete enough" }).isThinProfile, true);
  assert.equal(scoreFounderProfile(null).isThinProfile, false);
});

test("editing a saved value immediately updates the pure completeness result", () => {
  const before = scoreStartupProfile({ startupName: "Loop" });
  const after = scoreStartupProfile({
    startupName: "Loop",
    oneLiner: "A better introduction",
  });
  assert.equal(after.score - before.score, 14);
  assert.equal(after.missingItems.length, before.missingItems.length - 1);
});
