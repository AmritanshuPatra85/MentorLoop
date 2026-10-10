"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  scoreFounderProfile,
  scoreMentorProfile,
  scoreStartupProfile,
  myProfileResponseSchema,
} from "@mentorloop/shared";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ApiStatusCard } from "@/components/status/api-status-card";
import { ProfileCompletenessCard } from "@/components/profiles/profile-completeness-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useAuth } from "@/components/auth/auth-provider";
import { FounderStartupTimeline } from "@/components/timeline/startup-timeline";

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;
  const eligible = role === "founder" || role === "mentor";
  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => api.get("/profiles/me", myProfileResponseSchema),
    enabled: eligible,
  });
  const profile = profileQuery.data?.profile;
  const reports =
    role === "founder"
      ? [scoreFounderProfile(profile), scoreStartupProfile(profile)]
      : role === "mentor"
        ? [scoreMentorProfile(profile)]
        : [];
  const startupName =
    typeof profile?.startupName === "string" && profile.startupName.trim()
      ? profile.startupName
      : "your startup";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          role === "founder"
            ? `Welcome back. Keep ${startupName} ready to meet the right mentors.`
            : role === "mentor"
              ? "Welcome back. Keep your expertise and availability current for founders."
              : "Welcome to MentorLoop."
        }
      />
      {eligible && profileQuery.isError ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Your profile could not be loaded right now.
            </p>
            <Button variant="outline" onClick={() => void profileQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {eligible && profileQuery.data ? (
        <div className="space-y-4">
          <ProfileCompletenessCard reports={reports} />
          <div className="flex justify-end">
            <Link
              className="text-sm font-medium text-primary underline underline-offset-4"
              href="/profile"
            >
              Review and edit profile
            </Link>
          </div>
        </div>
      ) : null}
      {role === "founder" ? <FounderStartupTimeline /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <ApiStatusCard />
        <EmptyState
          icon={Inbox}
          title="Nothing here yet"
          description="Your recommended matches and upcoming sessions will show up here as they become available."
        />
      </div>
    </>
  );
}
