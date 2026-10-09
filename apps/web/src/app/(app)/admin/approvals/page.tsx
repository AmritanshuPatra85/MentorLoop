"use client";

import {
  adminMentorApprovalQueueSchema,
  adminMentorDecisionResponseSchema,
  mentorRejectionSchema,
} from "@mentorloop/shared";
import { Check, Clock3, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ApiClientError, api } from "@/lib/api-client";

const QUERY_KEY = ["admin", "mentor-approvals"];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function errorText(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : "We couldn’t load or update applications. Please try again.";
}

function TagList({ values }: { values: string[] }) {
  return values.length ? (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
          {value}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-sm text-muted-foreground">None provided</span>
  );
}

export default function AdminApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState("");
  const applications = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get("/admin/mentor-approvals", adminMentorApprovalQueueSchema),
  });
  const approve = useMutation({
    mutationFn: (mentorId: string) =>
      api.post(
        `/admin/mentor-approvals/${mentorId}/approve`,
        adminMentorDecisionResponseSchema,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const reject = useMutation({
    mutationFn: ({ mentorId, reason }: { mentorId: string; reason: string }) =>
      api.post(
        `/admin/mentor-approvals/${mentorId}/reject`,
        adminMentorDecisionResponseSchema,
        { reason },
      ),
    onSuccess: () => {
      setRejectingId(null);
      setValidationError("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function submitRejection(mentorId: string) {
    const parsed = mentorRejectionSchema.safeParse({ reason: reasons[mentorId] ?? "" });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Enter a rejection reason.");
      return;
    }
    setValidationError("");
    reject.mutate({ mentorId, reason: parsed.data.reason });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Mentor approvals"
        description="Review completed mentor applications and decide who can join the platform."
      />

      {(approve.error || reject.error) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorText(approve.error ?? reject.error)}
        </p>
      )}

      {applications.isPending ? (
        <div
          className="flex items-center gap-2 py-12 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" /> Loading mentor applications…
        </div>
      ) : applications.error ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <p className="text-sm text-destructive">{errorText(applications.error)}</p>
            <Button variant="outline" onClick={() => void applications.refetch()}>
              <RefreshCw /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : applications.data.applications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>
              No mentor applications are waiting for review.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-5">
          {applications.data.applications.map((application) => {
            const busy = approve.isPending || reject.isPending;
            return (
              <Card key={application.mentorId}>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">{application.fullName}</h2>
                    <p className="text-sm text-muted-foreground">{application.email}</p>
                    <p className="text-sm">
                      {[application.currentRole, application.organization]
                        .filter(Boolean)
                        .join(" · ") || "Professional headline not provided"}
                      {application.yearsExperience !== null
                        ? ` · ${application.yearsExperience} years’ experience`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-4" />
                    Submitted {new Date(application.submittedAt).toLocaleDateString()}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Professional bio</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {application.bio}
                      </p>
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Relevant experience</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {application.experienceSummary}
                      </p>
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Domains</h3>
                      <TagList values={application.domainNames} />
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Skills</h3>
                      <TagList values={application.skillNames} />
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Mentorship stages</h3>
                      <TagList values={application.stageNames} />
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Mentorship topics</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {application.helpTopics}
                      </p>
                    </section>
                  </div>

                  <div className="grid gap-3 rounded-lg bg-secondary/50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      <span className="text-muted-foreground">Capacity:</span>{" "}
                      {application.maxMentees ?? "—"} mentees
                    </p>
                    <p>
                      <span className="text-muted-foreground">Session:</span>{" "}
                      {application.sessionLengthMinutes ?? "—"} minutes
                    </p>
                    <p>
                      <span className="text-muted-foreground">Timezone:</span>{" "}
                      {application.timezone || "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      {application.status.replaceAll("_", " ")}
                    </p>
                  </div>

                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Preferred session windows</h3>
                    {application.preferredSessionTimes.length ? (
                      <ul className="flex flex-wrap gap-2">
                        {application.preferredSessionTimes.map((window, index) => (
                          <li
                            key={`${window.day}-${window.start}-${index}`}
                            className="rounded-md border border-border px-3 py-2 text-sm"
                          >
                            {DAY_NAMES[window.day] ?? `Day ${window.day}`} ·{" "}
                            {window.start}–{window.end}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No session windows provided.
                      </p>
                    )}
                  </section>

                  <div className="flex flex-wrap gap-4 text-sm">
                    {application.linkedinUrl && (
                      <a
                        className="inline-flex items-center gap-1 underline underline-offset-4"
                        href={application.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        LinkedIn <ExternalLink className="size-3" />
                      </a>
                    )}
                    {application.websiteUrl && (
                      <a
                        className="inline-flex items-center gap-1 underline underline-offset-4"
                        href={application.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Website <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>

                  {rejectingId === application.mentorId ? (
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <label
                        className="block space-y-2 text-sm font-medium"
                        htmlFor={`reason-${application.mentorId}`}
                      >
                        Rejection reason
                        <textarea
                          id={`reason-${application.mentorId}`}
                          rows={3}
                          maxLength={1000}
                          value={reasons[application.mentorId] ?? ""}
                          onChange={(event) =>
                            setReasons({
                              ...reasons,
                              [application.mentorId]: event.target.value,
                            })
                          }
                          className="w-full rounded-md border border-input bg-background px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          placeholder="Explain what the mentor should improve before reapplying."
                        />
                      </label>
                      {validationError && (
                        <p role="alert" className="text-sm text-destructive">
                          {validationError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="destructive"
                          onClick={() => submitRejection(application.mentorId)}
                          disabled={busy}
                        >
                          {reject.isPending ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <X />
                          )}{" "}
                          Confirm rejection
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRejectingId(null);
                            setValidationError("");
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRejectingId(application.mentorId);
                          setValidationError("");
                        }}
                        disabled={busy}
                      >
                        <X /> Reject
                      </Button>
                      <Button
                        onClick={() => approve.mutate(application.mentorId)}
                        disabled={busy}
                      >
                        {approve.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Check />
                        )}{" "}
                        Approve mentor
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
