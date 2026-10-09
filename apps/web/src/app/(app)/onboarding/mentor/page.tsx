"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  mentorOnboardingCompleteSchema,
  mentorOnboardingDraftSchema,
  mentorOnboardingResponseSchema,
  mentorOnboardingSaveResponseSchema,
  taxonomyDomainSchema,
  taxonomySkillSchema,
  taxonomyStageSchema,
  type MentorOnboardingDraft,
} from "@mentorloop/shared";
import { z } from "zod";
import { Field } from "@/components/auth/field";
import { MultiSelect } from "@/components/common/multi-select";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiClientError, api, updateSessionUser } from "@/lib/api-client";

const domainListSchema = z.array(taxonomyDomainSchema);
const skillListSchema = z.array(taxonomySkillSchema);
const stageListSchema = z.array(taxonomyStageSchema);
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const SESSION_LENGTHS = [30, 45, 60, 90] as const;
const STEPS = [
  "Professional profile",
  "Expertise",
  "Mentorship",
  "Capacity & time",
  "Links & review",
];
const EMPTY: MentorOnboardingDraft = {
  currentRole: "",
  organization: "",
  bio: "",
  experienceSummary: "",
  domainSlugs: [],
  skillSlugs: [],
  stageSlugs: [],
  helpTopics: "",
  maxMentees: 3,
  sessionLengthMinutes: 60,
  timezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "Asia/Kolkata",
  preferredSessionTimes: [],
  linkedinUrl: "",
  websiteUrl: "",
};

function errorMessage(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : "We couldn’t save your mentor profile. Please try again.";
}

export default function MentorOnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<MentorOnboardingDraft>(EMPTY);
  const [notice, setNotice] = useState("");

  const profileQuery = useQuery({
    queryKey: ["mentor-onboarding"],
    queryFn: () => api.get("/mentor-onboarding", mentorOnboardingResponseSchema),
  });
  const domainsQuery = useQuery({
    queryKey: ["taxonomy", "domains"],
    queryFn: () => api.get("/taxonomy/domains", domainListSchema),
  });
  const skillsQuery = useQuery({
    queryKey: ["taxonomy", "skills"],
    queryFn: () => api.get("/taxonomy/skills", skillListSchema),
  });
  const stagesQuery = useQuery({
    queryKey: ["taxonomy", "stages"],
    queryFn: () => api.get("/taxonomy/stages", stageListSchema),
  });

  useEffect(() => {
    if (profileQuery.data) {
      setValue({ ...EMPTY, ...(profileQuery.data.profile ?? {}) });
      if (profileQuery.data.profile?.isComplete && user?.status === "pending_approval") {
        router.replace("/pending-approval");
      }
    }
  }, [profileQuery.data, router, user?.status]);

  const saveDraft = useMutation({
    mutationFn: (draft: MentorOnboardingDraft) =>
      api.put("/mentor-onboarding/draft", mentorOnboardingSaveResponseSchema, draft),
    onSuccess: ({ profile, status, rejectionReason }) => {
      queryClient.setQueryData(["mentor-onboarding"], { profile });
      if (user) updateSessionUser({ ...user, status, rejectionReason });
      setNotice("Draft saved. You can return and finish it later.");
    },
  });
  const complete = useMutation({
    mutationFn: (draft: MentorOnboardingDraft) => {
      const validated = mentorOnboardingCompleteSchema.parse(draft);
      return api.post(
        "/mentor-onboarding/complete",
        mentorOnboardingSaveResponseSchema,
        validated,
      );
    },
    onSuccess: ({ profile, status, rejectionReason }) => {
      queryClient.setQueryData(["mentor-onboarding"], { profile });
      if (user) updateSessionUser({ ...user, status, rejectionReason });
      router.replace("/pending-approval");
    },
  });

  const saving = saveDraft.isPending || complete.isPending;
  const actionError = saveDraft.error ?? complete.error;
  const domains = domainsQuery.data ?? [];
  const skills = skillsQuery.data ?? [];
  const stages = stagesQuery.data ?? [];

  async function persistDraft() {
    setNotice("");
    const parsed = mentorOnboardingDraftSchema.safeParse(value);
    if (!parsed.success) {
      setNotice(
        parsed.error.issues[0]?.message ?? "Please check the fields and try again.",
      );
      return false;
    }
    await saveDraft.mutateAsync(parsed.data);
    return true;
  }

  async function continueStep() {
    const saved = await persistDraft();
    if (saved) {
      setStep((current) => Math.min(STEPS.length - 1, current + 1));
      setNotice("");
    }
  }

  function finish() {
    setNotice("");
    const parsed = mentorOnboardingCompleteSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.map(String).join(".") ?? "";
      const invalidSteps: Array<[number, string[]]> = [
        [0, ["bio", "experienceSummary"]],
        [1, ["domainSlugs", "skillSlugs"]],
        [2, ["stageSlugs", "helpTopics"]],
        [3, ["maxMentees", "sessionLengthMinutes", "timezone", "preferredSessionTimes"]],
        [4, ["linkedinUrl", "websiteUrl"]],
      ];
      const target = invalidSteps.find(([, fields]) =>
        fields.some((name) => field === name || field.startsWith(`${name}.`)),
      )?.[0];
      if (target !== undefined) setStep(target);
      setNotice(issue?.message ?? "Complete every required field before submitting.");
      return;
    }
    complete.mutate(parsed.data);
  }

  const isLoading =
    profileQuery.isLoading ||
    domainsQuery.isLoading ||
    skillsQuery.isLoading ||
    stagesQuery.isLoading;
  const loadError =
    profileQuery.error ?? domainsQuery.error ?? skillsQuery.error ?? stagesQuery.error;
  if (isLoading) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 py-16 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" /> Loading your mentor onboarding
        workspace…
      </div>
    );
  }
  if (loadError) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-destructive">{errorMessage(loadError)}</p>
          <Button
            variant="outline"
            onClick={() => {
              void profileQuery.refetch();
              void domainsQuery.refetch();
              void skillsQuery.refetch();
              void stagesQuery.refetch();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const selectedDomains = value.domainSlugs ?? [];
  const selectedSkills = value.skillSlugs ?? [];
  const selectedStages = value.stageSlugs ?? [];
  const isCompleted = Boolean(profileQuery.data?.profile?.isComplete);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Create your mentor profile"
        description="Share your experience and the areas where you can help student founders."
      />
      {isCompleted && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Your profile has been submitted for review. You can update these details and
            submit again.
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="space-y-7 p-5 sm:p-8">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                Step {step + 1} of {STEPS.length}
              </span>
              <span className="text-muted-foreground">{STEPS[step]}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <div className="hidden grid-cols-5 gap-2 md:grid">
              {STEPS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  className={`truncate text-left text-xs ${index === step ? "font-semibold text-foreground" : index < step ? "text-primary" : "text-muted-foreground"}`}
                  aria-current={index === step ? "step" : undefined}
                >
                  {index < step ? <Check className="mr-1 inline size-3" /> : null}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="mentorName" label="Full name">
                <Input id="mentorName" value={user?.fullName ?? ""} disabled />
              </Field>
              <Field id="mentorEmail" label="Email">
                <Input id="mentorEmail" value={user?.email ?? ""} disabled />
              </Field>
              <Field id="currentRole" label="Current role or designation" hint="Optional">
                <Input
                  id="currentRole"
                  value={value.currentRole ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, currentRole: event.target.value })
                  }
                  placeholder="Product leader, Founder, Engineer…"
                />
              </Field>
              <Field id="organization" label="Organization" hint="Optional">
                <Input
                  id="organization"
                  value={value.organization ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, organization: event.target.value })
                  }
                  placeholder="Company or institution"
                />
              </Field>
              <Field
                id="yearsExperience"
                label="Years of relevant experience"
                hint="Optional"
              >
                <Input
                  id="yearsExperience"
                  type="number"
                  min={0}
                  max={60}
                  value={value.yearsExperience ?? ""}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      yearsExperience:
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="bio" label="Professional bio" hint="At least 50 characters">
                  <textarea
                    id="bio"
                    rows={4}
                    maxLength={2000}
                    value={value.bio ?? ""}
                    onChange={(event) => setValue({ ...value, bio: event.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Introduce yourself and the experience you bring to founders."
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  id="experienceSummary"
                  label="Relevant experience"
                  hint="At least 20 characters"
                >
                  <textarea
                    id="experienceSummary"
                    rows={4}
                    maxLength={2000}
                    value={value.experienceSummary ?? ""}
                    onChange={(event) =>
                      setValue({ ...value, experienceSummary: event.target.value })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Describe the work, industries or startup stages you know well."
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <Field
                id="domains"
                label="Industry and domain areas"
                hint="Choose up to ten"
              >
                <MultiSelect
                  options={domains}
                  selectedSlugs={selectedDomains}
                  onChange={(slugs) => {
                    if (slugs.length <= 10) setValue({ ...value, domainSlugs: slugs });
                  }}
                  placeholder="Select domains…"
                />
              </Field>
              <Field id="skills" label="Skills you can offer" hint="Choose up to twenty">
                <MultiSelect
                  options={skills}
                  selectedSlugs={selectedSkills}
                  onChange={(slugs) => {
                    if (slugs.length <= 20) setValue({ ...value, skillSlugs: slugs });
                  }}
                  placeholder="Select skills…"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Startup stages you’re comfortable supporting
                </legend>
                <p className="text-xs text-muted-foreground">
                  Choose every stage where your experience can help.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {stages.map((stage) => (
                    <label
                      key={stage.slug}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStages.includes(stage.slug)}
                        onChange={(event) =>
                          setValue({
                            ...value,
                            stageSlugs: event.target.checked
                              ? [...selectedStages, stage.slug]
                              : selectedStages.filter((slug) => slug !== stage.slug),
                          })
                        }
                        className="mt-1 accent-[hsl(var(--primary))]"
                      />
                      <span>
                        <span className="block text-sm font-medium">{stage.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {stage.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field
                id="helpTopics"
                label="Mentorship topics and the help you can provide"
                hint="At least 10 characters"
              >
                <textarea
                  id="helpTopics"
                  rows={5}
                  maxLength={1200}
                  value={value.helpTopics ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, helpTopics: event.target.value })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="For example: customer discovery, product strategy, fundraising preparation…"
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="maxMentees" label="Maximum number of mentees">
                  <Input
                    id="maxMentees"
                    type="number"
                    min={1}
                    max={20}
                    value={value.maxMentees ?? ""}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        maxMentees:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field id="sessionLengthMinutes" label="Preferred session length">
                  <select
                    id="sessionLengthMinutes"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={value.sessionLengthMinutes ?? ""}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        sessionLengthMinutes:
                          event.target.value === ""
                            ? undefined
                            : (Number(event.target.value) as 30 | 45 | 60 | 90),
                      })
                    }
                  >
                    <option value="">Choose duration</option>
                    {SESSION_LENGTHS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    id="timezone"
                    label="Timezone"
                    hint="Use an IANA timezone, such as Asia/Kolkata"
                  >
                    <Input
                      id="timezone"
                      value={value.timezone ?? ""}
                      onChange={(event) =>
                        setValue({ ...value, timezone: event.target.value })
                      }
                      placeholder="Asia/Kolkata"
                    />
                  </Field>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Preferred session windows</p>
                  <p className="text-xs text-muted-foreground">
                    Add at least one window to submit your profile. You can manage your
                    full availability later.
                  </p>
                </div>
                {(value.preferredSessionTimes ?? []).map((window, index) => (
                  <div
                    key={`${index}-${window.day}`}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <select
                      aria-label={`Preferred day ${index + 1}`}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={window.day}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          preferredSessionTimes: value.preferredSessionTimes!.map(
                            (item, i) =>
                              i === index
                                ? { ...item, day: Number(event.target.value) }
                                : item,
                          ),
                        })
                      }
                    >
                      {DAYS.map((day, dayIndex) => (
                        <option key={day} value={dayIndex}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={`Start time ${index + 1}`}
                      type="time"
                      value={window.start}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          preferredSessionTimes: value.preferredSessionTimes!.map(
                            (item, i) =>
                              i === index ? { ...item, start: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label={`End time ${index + 1}`}
                      type="time"
                      value={window.end}
                      onChange={(event) =>
                        setValue({
                          ...value,
                          preferredSessionTimes: value.preferredSessionTimes!.map(
                            (item, i) =>
                              i === index ? { ...item, end: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        setValue({
                          ...value,
                          preferredSessionTimes: value.preferredSessionTimes!.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                      aria-label={`Remove preferred window ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setValue({
                      ...value,
                      preferredSessionTimes: [
                        ...(value.preferredSessionTimes ?? []),
                        { day: 1, start: "10:00", end: "12:00" },
                      ],
                    })
                  }
                  disabled={(value.preferredSessionTimes?.length ?? 0) >= 21}
                >
                  Add a time window
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="linkedinUrl" label="LinkedIn profile" hint="Optional">
                  <Input
                    id="linkedinUrl"
                    type="url"
                    value={value.linkedinUrl ?? ""}
                    onChange={(event) =>
                      setValue({ ...value, linkedinUrl: event.target.value })
                    }
                    placeholder="https://linkedin.com/in/you"
                  />
                </Field>
                <Field id="websiteUrl" label="Website or portfolio" hint="Optional">
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={value.websiteUrl ?? ""}
                    onChange={(event) =>
                      setValue({ ...value, websiteUrl: event.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </Field>
              </div>
              <section
                className="space-y-2 rounded-lg border border-border bg-secondary/40 p-4"
                aria-labelledby="review-heading"
              >
                <h2 id="review-heading" className="font-semibold">
                  Review your mentor profile
                </h2>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>{user?.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Role / organization</dt>
                    <dd>
                      {[value.currentRole, value.organization]
                        .filter(Boolean)
                        .join(" · ") || "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Domains</dt>
                    <dd>
                      {domains
                        .filter((item) => selectedDomains.includes(item.slug))
                        .map((item) => item.name)
                        .join(", ") || "Choose at least one"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Skills</dt>
                    <dd>
                      {skills
                        .filter((item) => selectedSkills.includes(item.slug))
                        .map((item) => item.name)
                        .join(", ") || "Choose at least one"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stages</dt>
                    <dd>
                      {stages
                        .filter((item) => selectedStages.includes(item.slug))
                        .map((item) => item.name)
                        .join(", ") || "Choose at least one"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Capacity and session</dt>
                    <dd>
                      {value.maxMentees ?? "—"} mentees ·{" "}
                      {value.sessionLengthMinutes ?? "—"} minutes
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Timezone</dt>
                    <dd>{value.timezone || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Preferred windows</dt>
                    <dd>
                      {(value.preferredSessionTimes?.length ?? 0) > 0
                        ? `${value.preferredSessionTimes!.length} added`
                        : "Required — add at least one in step 4"}
                    </dd>
                  </div>
                </dl>
                <p className="pt-2 text-xs text-muted-foreground">
                  After submission, your profile will be sent to the MentorLoop team for
                  approval.
                </p>
              </section>
            </div>
          )}

          {(notice || actionError) && (
            <p
              role="alert"
              className={`text-sm ${actionError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {actionError ? errorMessage(actionError) : notice}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Button
              variant="outline"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
            >
              <ArrowLeft /> Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void persistDraft()}
                disabled={saving}
              >
                <Save /> Save draft
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => void continueStep()} disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />} Continue <ArrowRight />
                </Button>
              ) : (
                <Button onClick={finish} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />} Submit for
                  approval
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
