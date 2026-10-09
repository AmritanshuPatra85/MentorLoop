"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  avatarResponseSchema,
  founderProfileUpdateSchema,
  mentorProfileUpdateSchema,
  myProfileResponseSchema,
  scoreFounderProfile,
  scoreMentorProfile,
  scoreStartupProfile,
  type MyProfileResponse,
  taxonomyDomainSchema,
  taxonomySkillSchema,
  taxonomyStageSchema,
  type TaxonomyDomain,
  type TaxonomySkill,
} from "@mentorloop/shared";
import { Loader2, Save, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { Field } from "@/components/auth/field";
import { MultiSelect } from "@/components/common/multi-select";
import { ProfileCompletenessCard } from "@/components/profiles/profile-completeness-card";
import { PageHeader } from "@/components/common/page-header";
import { StageSelect } from "@/components/common/stage-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { mergeProfileOptimistically, rollbackProfile } from "@/lib/profile-cache";

const ownProfileSchema = myProfileResponseSchema;
const domainListSchema = z.array(taxonomyDomainSchema);
const skillListSchema = z.array(taxonomySkillSchema);
const stageListSchema = z.array(taxonomyStageSchema);
const queryKey = ["my-profile"] as const;
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
type Draft = Record<string, unknown>;
type PreferredSessionWindow = { day: number; start: string; end: string };
const EDITABLE_FIELDS = {
  founder: [
    "founderTitle",
    "linkedinUrl",
    "startupName",
    "oneLiner",
    "description",
    "domainSlugs",
    "primaryDomainSlug",
    "stageSlug",
    "helpNeeded",
    "goals",
    "timezone",
    "preferredSessionTimes",
  ],
  mentor: [
    "currentRole",
    "organization",
    "bio",
    "experienceSummary",
    "yearsExperience",
    "domainSlugs",
    "skillSlugs",
    "stageSlugs",
    "helpTopics",
    "maxMentees",
    "sessionLengthMinutes",
    "timezone",
    "preferredSessionTimes",
    "linkedinUrl",
    "websiteUrl",
  ],
} as const;

function editableDraft(
  role: "founder" | "mentor",
  profile: Record<string, unknown> | null,
) {
  if (!profile) return {};
  return Object.fromEntries(
    EDITABLE_FIELDS[role]
      .filter((key) => key in profile)
      .map((key) => [key, profile[key]]),
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}
function windows(value: unknown): PreferredSessionWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is PreferredSessionWindow =>
      !!v &&
      typeof v === "object" &&
      "day" in v &&
      typeof v.day === "number" &&
      "start" in v &&
      typeof v.start === "string" &&
      "end" in v &&
      typeof v.end === "string",
  );
}
function errorMessage(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Could not save your profile. Try again.";
}

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({});
  const [avatarPreview, setAvatarPreview] = useState("");
  const [validationError, setValidationError] = useState("");
  const profileQuery = useQuery({
    queryKey,
    queryFn: () => api.get("/profiles/me", ownProfileSchema),
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
  const data = profileQuery.data;
  useEffect(() => {
    if (!data?.profile) return;
    setDraft(editableDraft(data.role, data.profile));
  }, [data]);
  useEffect(
    () => () => {
      if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  const save = useMutation({
    mutationFn: (input: Draft) => api.put("/profiles/me", ownProfileSchema, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MyProfileResponse>(queryKey);
      if (previous)
        queryClient.setQueryData(queryKey, mergeProfileOptimistically(previous, input));
      return { previous };
    },
    onError: (error, _input, context) => {
      const restored = rollbackProfile(context?.previous);
      if (restored) queryClient.setQueryData(queryKey, restored);
      toast.error(errorMessage(error));
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      if (result.profile) setDraft(editableDraft(result.role, result.profile));
      toast.success("Profile saved");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 512 * 1024) throw new Error("Choose an image up to 512 KB.");
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG, or WebP image.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return api.post("/profiles/me/avatar", avatarResponseSchema, {
        mimeType: file.type,
        data: btoa(binary),
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      return queryClient.getQueryData<MyProfileResponse>(queryKey);
    },
    onError: (error) => {
      setAvatarPreview("");
      toast.error(errorMessage(error));
    },
    onSuccess: (result) => {
      const previous = queryClient.getQueryData<MyProfileResponse>(queryKey);
      if (previous)
        queryClient.setQueryData(queryKey, { ...previous, avatarUrl: result.avatarUrl });
      setAvatarPreview("");
      toast.success("Avatar updated");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const domains = domainsQuery.data ?? [];
  const skills = skillsQuery.data ?? [];
  const stages = stagesQuery.data ?? [];
  const role = data?.role ?? user?.role;
  const errors =
    profileQuery.error ??
    domainsQuery.error ??
    (role === "mentor" ? skillsQuery.error : null) ??
    stagesQuery.error;
  const loading =
    profileQuery.isPending ||
    domainsQuery.isPending ||
    stagesQuery.isPending ||
    (role === "mentor" && skillsQuery.isPending);
  const displayAvatar = avatarPreview || data?.avatarUrl || "";
  const completenessReports =
    role === "founder"
      ? [scoreFounderProfile(draft), scoreStartupProfile(draft)]
      : role === "mentor"
        ? [scoreMentorProfile(draft)]
        : [];

  function set(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError("");
  }
  function submit() {
    const schema =
      role === "mentor" ? mentorProfileUpdateSchema : founderProfileUpdateSchema;
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? "Review the highlighted profile fields.",
      );
      return;
    }
    save.mutate(parsed.data as Draft);
  }
  function field(
    id: string,
    label: string,
    options: { multiline?: boolean; type?: string; max?: number } = {},
  ) {
    const value = text(draft[id]);
    const control = options.multiline ? (
      <textarea
        id={id}
        value={value}
        maxLength={options.max}
        onChange={(event) => set(id, event.target.value)}
        rows={4}
        className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    ) : (
      <Input
        id={id}
        type={options.type ?? "text"}
        maxLength={options.max}
        value={value}
        onChange={(event) =>
          set(
            id,
            options.type === "number"
              ? event.target.value === ""
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
    );
    return (
      <Field key={id} id={id} label={label}>
        {control}
      </Field>
    );
  }
  function taxonomyField(
    key: string,
    label: string,
    options: Array<TaxonomyDomain | TaxonomySkill>,
    max: number,
  ) {
    const values = strings(draft[key]);
    return (
      <div key={key} id={key} className="scroll-mt-24">
        <Field id={key} label={label}>
          <MultiSelect
            options={options}
            selectedSlugs={values}
            onChange={(next) => set(key, next.slice(0, max))}
          />
        </Field>
      </div>
    );
  }
  function scheduleEditor() {
    const values = windows(draft.preferredSessionTimes);
    return (
      <section
        id="preferredSessionTimes"
        className="scroll-mt-24 space-y-3 sm:col-span-2"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Preferred session times</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set("preferredSessionTimes", [
                ...values,
                { day: 1, start: "09:00", end: "10:00" },
              ])
            }
          >
            Add time
          </Button>
        </div>
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No preferred windows added.</p>
        ) : (
          values.map((item, index) => (
            <div
              key={`${index}-${item.day}`}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <select
                aria-label="Day"
                value={item.day}
                onChange={(event) =>
                  set(
                    "preferredSessionTimes",
                    values.map((v, i) =>
                      i === index ? { ...v, day: Number(event.target.value) } : v,
                    ),
                  )
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {days.map((day, dayIndex) => (
                  <option key={day} value={dayIndex}>
                    {day}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Start time"
                type="time"
                value={item.start}
                onChange={(event) =>
                  set(
                    "preferredSessionTimes",
                    values.map((v, i) =>
                      i === index ? { ...v, start: event.target.value } : v,
                    ),
                  )
                }
              />
              <Input
                aria-label="End time"
                type="time"
                value={item.end}
                onChange={(event) =>
                  set(
                    "preferredSessionTimes",
                    values.map((v, i) =>
                      i === index ? { ...v, end: event.target.value } : v,
                    ),
                  )
                }
              />
              <Button
                variant="outline"
                aria-label="Remove time"
                onClick={() =>
                  set(
                    "preferredSessionTimes",
                    values.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </section>
    );
  }

  if (loading)
    return (
      <div role="status" className="flex items-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading profile…
      </div>
    );
  if (errors || !role || !data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {errorMessage(errors)}
        </CardContent>
      </Card>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Your profile"
        description="Keep your profile current. Your account email and approval status are managed separately."
        actions={
          data.publicProfilePath ? (
            <Link
              href={data.publicProfilePath}
              target="_blank"
              className="text-sm font-medium underline underline-offset-4"
            >
              View public profile
            </Link>
          ) : undefined
        }
      />
      <ProfileCompletenessCard reports={completenessReports} saved={false} />
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Profile photo</h2>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt="Profile avatar preview"
              className="size-20 rounded-full object-cover"
            />
          ) : (
            <div className="grid size-20 place-items-center rounded-full bg-secondary">
              <UserRound className="size-8 text-muted-foreground" />
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {upload.isPending ? "Uploading…" : "Upload or replace"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setAvatarPreview(URL.createObjectURL(file));
                  upload.mutate(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground">
            PNG, JPEG or WebP · up to 512 KB
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">
            {role === "founder"
              ? "Founder and startup information"
              : "Professional information"}
          </h2>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {role === "founder" ? (
            <>
              {field("founderTitle", "Founder title", { max: 100 })}
              {field("linkedinUrl", "LinkedIn URL", { type: "url", max: 500 })}
              {field("startupName", "Startup name", { max: 120 })}
              {field("oneLiner", "One-line pitch", { max: 180 })}
              <div className="sm:col-span-2">
                {field("description", "Startup description", {
                  multiline: true,
                  max: 3000,
                })}
              </div>
              <div className="sm:col-span-2">
                {taxonomyField("domainSlugs", "Domains", domains, 5)}
              </div>
              <Field id="primaryDomainSlug" label="Primary domain">
                <select
                  id="primaryDomainSlug"
                  value={text(draft.primaryDomainSlug)}
                  onChange={(event) => set("primaryDomainSlug", event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a primary domain</option>
                  {domains
                    .filter((item) => strings(draft.domainSlugs).includes(item.slug))
                    .map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field id="stageSlug" label="Startup stage">
                  <StageSelect
                    stages={stages}
                    value={text(draft.stageSlug)}
                    onChange={(value) => set("stageSlug", value)}
                  />
                </Field>
              </div>
              <div>
                {field("helpNeeded", "Mentorship needs", { multiline: true, max: 2000 })}
              </div>
              <div>{field("goals", "Goals", { multiline: true, max: 2000 })}</div>
              {field("timezone", "Timezone", { max: 100 })}
              {scheduleEditor()}
            </>
          ) : (
            <>
              {field("currentRole", "Current role", { max: 120 })}
              {field("organization", "Organization", { max: 160 })}
              <div className="sm:col-span-2">
                {field("bio", "Professional bio", { multiline: true, max: 2000 })}
              </div>
              <div className="sm:col-span-2">
                {field("experienceSummary", "Experience", { multiline: true, max: 2000 })}
              </div>
              {field("yearsExperience", "Years of experience", { type: "number" })}
              {field("maxMentees", "Mentor capacity", { type: "number" })}
              {field("sessionLengthMinutes", "Session length (minutes)", {
                type: "number",
              })}
              {field("timezone", "Timezone", { max: 100 })}
              <div className="sm:col-span-2">
                {taxonomyField("domainSlugs", "Expertise domains", domains, 10)}
              </div>
              <div className="sm:col-span-2">
                {taxonomyField("skillSlugs", "Skills", skills, 20)}
              </div>
              <div className="sm:col-span-2">
                <Field id="stageSlugs" label="Mentorship stages">
                  <MultiSelect
                    options={stages}
                    selectedSlugs={strings(draft.stageSlugs)}
                    onChange={(value) => set("stageSlugs", value.slice(0, 5))}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                {field("helpTopics", "Mentorship interests", {
                  multiline: true,
                  max: 1200,
                })}
              </div>
              {field("linkedinUrl", "LinkedIn URL", { type: "url", max: 500 })}
              {field("websiteUrl", "Professional website", { type: "url", max: 500 })}
              <div className="sm:col-span-2">{scheduleEditor()}</div>
            </>
          )}
          {(validationError || save.error) && (
            <p className="sm:col-span-2 text-sm text-destructive" role="alert">
              {validationError || errorMessage(save.error)}
            </p>
          )}
          {save.isSuccess && (
            <p className="sm:col-span-2 text-sm text-muted-foreground" role="status">
              Saved. Your public profile will show the latest approved information.
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end border-t border-border pt-4">
            <Button onClick={submit} disabled={save.isPending || upload.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}Save
              profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
