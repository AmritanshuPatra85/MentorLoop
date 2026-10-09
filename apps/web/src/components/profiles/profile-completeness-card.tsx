"use client";

import Link from "next/link";
import { Check, Circle, Sparkles } from "lucide-react";
import type { ProfileCompletenessReport } from "@mentorloop/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const titles = {
  founder: "Founder profile",
  startup: "Startup profile",
  mentor: "Mentor profile",
} as const;

export function ProfileCompletenessCard({
  reports,
  saved = true,
}: {
  reports: ProfileCompletenessReport[];
  saved?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="gap-1 p-5 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h2 className="font-semibold">Profile completeness</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {saved
            ? "Your saved profile details and next steps."
            : "Live draft estimate — save your profile to keep these changes."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-1">
        {reports.map((report) => {
          const next = report.missingItems[0];
          return (
            <section
              key={report.profileType}
              aria-labelledby={`completeness-${report.profileType}`}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id={`completeness-${report.profileType}`}
                  className="text-sm font-medium"
                >
                  {titles[report.profileType]}
                </h3>
                <span className="text-sm font-semibold tabular-nums">
                  {report.score}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${titles[report.profileType]} completeness`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={report.score}
                className="h-2 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${report.score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {report.completedCount} of {report.totalCount} details complete
              </p>
              {report.isThinProfile ? (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  A few more details can help make your profile more useful for matching.
                  This is a suggestion; it does not limit your access.
                </p>
              ) : null}
              {next ? (
                <p className="text-sm">
                  Next:{" "}
                  <Link
                    className="font-medium text-primary underline underline-offset-4"
                    href={next.destination.href}
                  >
                    {next.label}
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your profile has the details needed for strong matches.
                </p>
              )}
              <ul className="grid gap-2 sm:grid-cols-2">
                {report.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.destination.href}
                      className="flex min-h-9 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.completed ? (
                        <Check
                          aria-hidden="true"
                          className="size-4 shrink-0 text-primary"
                        />
                      ) : (
                        <Circle aria-hidden="true" className="size-4 shrink-0" />
                      )}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
