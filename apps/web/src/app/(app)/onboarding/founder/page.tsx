"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  founderOnboardingCompleteSchema,
  founderOnboardingDraftSchema,
  founderOnboardingResponseSchema,
  founderOnboardingSaveResponseSchema,
  taxonomyDomainSchema,
  taxonomyStageSchema,
  type FounderOnboardingDraft,
} from "@mentorloop/shared";
import { z } from "zod";
import { PageHeader } from "@/components/common/page-header";
import { MultiSelect } from "@/components/common/multi-select";
import { StageSelect } from "@/components/common/stage-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/auth/field";
import { api, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/components/auth/auth-provider";

const domainListSchema = z.array(taxonomyDomainSchema);
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
const STEPS = [
  "Founder basics",
  "Startup identity",
  "Domains",
  "Stage",
  "Mentor support",
  "Availability",
];
const EMPTY: FounderOnboardingDraft = {
  founderTitle: "",
  linkedinUrl: "",
  startupName: "",
  oneLiner: "",
  description: "",
  domainSlugs: [],
  primaryDomainSlug: "",
  stageSlug: "",
  helpNeeded: "",
  goals: "",
  timezone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "Asia/Kolkata",
  preferredSessionTimes: [],
};

function messageFrom(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : "We couldn’t save your profile. Please try again.";
}

export default function FounderOnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [value, setValue] = useState<FounderOnboardingDraft>(EMPTY);
  const profileQuery = useQuery({
    queryKey: ["founder-onboarding"],
    queryFn: () => api.get("/founder-onboarding", founderOnboardingResponseSchema),
  });
  const domainsQuery = useQuery({
    queryKey: ["taxonomy", "domains"],
    queryFn: () => api.get("/taxonomy/domains", domainListSchema),
  });
  const stagesQuery = useQuery({
    queryKey: ["taxonomy", "stages"],
    queryFn: () => api.get("/taxonomy/stages", stageListSchema),
  });
  useEffect(() => {
    if (profileQuery.data) setValue({ ...EMPTY, ...(profileQuery.data.profile ?? {}) });
  }, [profileQuery.data]);

  const saveDraft = useMutation({
    mutationFn: (data: FounderOnboardingDraft) =>
      api.put("/founder-onboarding/draft", founderOnboardingSaveResponseSchema, data),
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(["founder-onboarding"], { profile });
      setNotice("Draft saved. You can return to this step any time.");
    },
  });
  const complete = useMutation({
    mutationFn: (data: FounderOnboardingDraft) => {
      const validated = founderOnboardingCompleteSchema.parse(data);
      return api.post(
        "/founder-onboarding/complete",
        founderOnboardingSaveResponseSchema,
        validated,
      );
    },
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(["founder-onboarding"], { profile });
      router.push("/");
    },
  });

  const saving = saveDraft.isPending || complete.isPending;
  const actionError = saveDraft.error ?? complete.error;

  async function persistDraft() {
    setNotice("");
    const parsed = founderOnboardingDraftSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setNotice(issue?.message ?? "Please check the fields and try again.");
      return false;
    }
    await saveDraft.mutateAsync(parsed.data);
    return true;
  }

  async function nextStep() {
    if (
      step === 1 &&
      (!value.startupName?.trim() ||
        !value.oneLiner?.trim() ||
        !value.description?.trim())
    ) {
      setNotice(
        "Add your startup name, one-line pitch and a short description before continuing.",
      );
      return;
    }
    if (step === 2 && (!value.domainSlugs?.length || !value.primaryDomainSlug)) {
      setNotice("Select at least one domain and choose the primary domain.");
      return;
    }
    if (step === 3 && !value.stageSlug) {
      setNotice("Choose your startup’s current stage.");
      return;
    }
    if (step === 4 && (!value.helpNeeded?.trim() || !value.goals?.trim())) {
      setNotice("Tell mentors where you need help and what you want to achieve.");
      return;
    }
    if (step < STEPS.length - 1) {
      const saved = await persistDraft();
      if (saved) {
        setStep((current) => current + 1);
        setNotice("");
      }
    }
  }

  async function finish() {
    setNotice("");
    const parsed = founderOnboardingCompleteSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.map(String).join(".") ?? "";
      const invalidSteps: Array<[number, string[]]> = [
        [0, ["founderTitle", "linkedinUrl"]],
        [1, ["startupName", "oneLiner", "description"]],
        [2, ["domainSlugs", "primaryDomainSlug"]],
        [3, ["stageSlug"]],
        [4, ["helpNeeded", "goals"]],
        [5, ["timezone", "preferredSessionTimes"]],
      ];
      const targetStep = invalidSteps.find(([, fields]) =>
        fields.some((name) => field === name || field.startsWith(`${name}.`)),
      )?.[0];
      if (targetStep !== undefined) setStep(targetStep);
      setNotice(issue?.message ?? "Complete every required field.");
      return;
    }
    complete.mutate(parsed.data);
  }

  if (profileQuery.isLoading || domainsQuery.isLoading || stagesQuery.isLoading) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 py-16 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" /> Loading your onboarding workspace…
      </div>
    );
  }
  if (profileQuery.isError || domainsQuery.isError || stagesQuery.isError) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-destructive">
            {messageFrom(profileQuery.error ?? domainsQuery.error ?? stagesQuery.error)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void profileQuery.refetch();
              void domainsQuery.refetch();
              void stagesQuery.refetch();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const domains = domainsQuery.data ?? [];
  const stages = stagesQuery.data ?? [];
  const selectedDomains = value.domainSlugs ?? [];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Build your founder profile"
        description="A few details help us introduce your startup to mentors who can move it forward."
      />
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
            <div className="hidden grid-cols-6 gap-2 md:grid">
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
              <Field id="founderName" label="Founder name">
                <Input id="founderName" value={user?.fullName ?? ""} disabled />
              </Field>
              <Field id="founderEmail" label="KIIT email">
                <Input id="founderEmail" value={user?.email ?? ""} disabled />
              </Field>
              <Field
                id="founderTitle"
                label="Your role in the startup"
                hint="For example, Co-founder & CEO"
              >
                <Input
                  id="founderTitle"
                  value={value.founderTitle ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, founderTitle: event.target.value })
                  }
                  placeholder="Founder"
                />
              </Field>
              <Field id="linkedinUrl" label="LinkedIn profile" hint="Optional">
                <Input
                  id="linkedinUrl"
                  value={value.linkedinUrl ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, linkedinUrl: event.target.value })
                  }
                  placeholder="https://linkedin.com/in/you"
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5">
              <Field id="startupName" label="Startup name">
                <Input
                  id="startupName"
                  value={value.startupName ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, startupName: event.target.value })
                  }
                  placeholder="What do you call your startup?"
                />
              </Field>
              <Field
                id="oneLiner"
                label="One-line pitch"
                hint="Explain what you do in one clear sentence"
              >
                <Input
                  id="oneLiner"
                  value={value.oneLiner ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, oneLiner: event.target.value })
                  }
                  maxLength={180}
                  placeholder="We help…"
                />
              </Field>
              <Field
                id="description"
                label="What are you building?"
                hint="Include the problem, your approach and who it serves"
              >
                <textarea
                  id="description"
                  value={value.description ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, description: event.target.value })
                  }
                  rows={5}
                  maxLength={3000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Describe your product and the people who need it."
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field
                id="domains"
                label="Choose up to five domains"
                hint="Select every area that describes your startup"
              >
                <MultiSelect
                  options={domains}
                  selectedSlugs={selectedDomains}
                  onChange={(slugs) => {
                    if (slugs.length > 5) {
                      setNotice("Choose no more than five domains.");
                      return;
                    }
                    setValue({
                      ...value,
                      domainSlugs: slugs,
                      primaryDomainSlug: slugs.includes(value.primaryDomainSlug ?? "")
                        ? value.primaryDomainSlug
                        : (slugs[0] ?? ""),
                    });
                  }}
                  placeholder="Select domains…"
                />
              </Field>
              {selectedDomains.length > 0 && (
                <Field id="primaryDomainSlug" label="Primary domain">
                  <select
                    id="primaryDomainSlug"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={value.primaryDomainSlug ?? ""}
                    onChange={(event) =>
                      setValue({ ...value, primaryDomainSlug: event.target.value })
                    }
                  >
                    <option value="">Choose the closest fit</option>
                    {domains
                      .filter((domain) => selectedDomains.includes(domain.slug))
                      .map((domain) => (
                        <option key={domain.slug} value={domain.slug}>
                          {domain.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
          )}

          {step === 3 && (
            <Field
              id="stageSlug"
              label="Where is your startup today?"
              hint="Choose the closest stage; you can update this later"
            >
              <StageSelect
                stages={stages}
                value={value.stageSlug ?? ""}
                onChange={(slug) => setValue({ ...value, stageSlug: slug })}
              />
            </Field>
          )}

          {step === 4 && (
            <div className="grid gap-5">
              <Field
                id="helpNeeded"
                label="What would you like help with?"
                hint="Specific topics help us find the right mentor"
              >
                <textarea
                  id="helpNeeded"
                  value={value.helpNeeded ?? ""}
                  onChange={(event) =>
                    setValue({ ...value, helpNeeded: event.target.value })
                  }
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Fundraising, finding first customers, product strategy…"
                />
              </Field>
              <Field
                id="goals"
                label="What are your goals for the next 6–12 months?"
                hint="Share the milestones you want to reach"
              >
                <textarea
                  id="goals"
                  value={value.goals ?? ""}
                  onChange={(event) => setValue({ ...value, goals: event.target.value })}
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="What would meaningful progress look like?"
                />
              </Field>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <Field
                id="timezone"
                label="Your timezone"
                hint="Times below are saved in this timezone"
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
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Preferred session windows</p>
                  <p className="text-xs text-muted-foreground">
                    Add the days and times you are usually free.
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

          {(notice || actionError) && (
            <p
              role="alert"
              className={`text-sm ${actionError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {actionError ? messageFrom(actionError) : notice}
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
                <Button onClick={() => void nextStep()} disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />} Continue <ArrowRight />
                </Button>
              ) : (
                <Button onClick={() => void finish()} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />} Complete
                  profile
                </Button>
              )}
            </div>
          </div>
          {profileQuery.data?.profile?.isComplete && (
            <p className="text-xs text-muted-foreground">
              Your profile is already complete. Changes are saved as a draft until you
              complete it again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
