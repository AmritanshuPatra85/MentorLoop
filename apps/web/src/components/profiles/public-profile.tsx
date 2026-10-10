"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowUpRight, Loader2, UserRound } from "lucide-react";
import {
  matchEventActionResponseSchema,
  publicMentorProfileSchema,
  publicStartupProfileSchema,
} from "@mentorloop/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { api } from "@/lib/api-client";
import { useAuth } from "@/components/auth/auth-provider";
import { InviteToConnect } from "@/components/connections/invite-to-connect";

function Tags({ values }: { values: string[] }) {
  return values.length ? (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-secondary px-3 py-1 text-xs">
          {value}
        </span>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Not provided</p>
  );
}

export function PublicMentorProfile({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["public-profile", "mentor", id],
    queryFn: () => api.get(`/profiles/mentors/${id}`, publicMentorProfileSchema),
  });
  if (query.isPending)
    return (
      <div role="status" className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading profile…
      </div>
    );
  if (query.isError) return <Unavailable />;
  const profile = query.data;
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <Avatar src={profile.avatarUrl} name={profile.name} />
          <div className="space-y-1">
            <PageHeader
              title={profile.name}
              description={
                [profile.currentRole, profile.organization].filter(Boolean).join(" · ") ||
                "Mentor"
              }
            />
            {profile.yearsExperience !== null && (
              <p className="text-sm text-muted-foreground">
                {profile.yearsExperience} years of experience
              </p>
            )}
          </div>
          <div className="sm:ml-auto flex gap-3">
            {profile.linkedinUrl && (
              <ExternalLink href={profile.linkedinUrl} label="LinkedIn" />
            )}
            {profile.websiteUrl && (
              <ExternalLink href={profile.websiteUrl} label="Website" />
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">About</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {profile.bio || "No biography provided."}
          </p>
          {profile.experienceSummary && (
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {profile.experienceSummary}
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Expertise</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tags values={profile.domains} />
            <Tags values={profile.skills} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Mentorship stages</h2>
          </CardHeader>
          <CardContent>
            <Tags values={profile.mentorshipStages} />
          </CardContent>
        </Card>
      </div>
    </article>
  );
}

export function PublicStartupProfile({ id }: { id: string }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["public-profile", "startup", id],
    queryFn: () => api.get(`/profiles/startups/${id}`, publicStartupProfileSchema),
  });
  useEffect(() => {
    if (user?.role === "mentor" && user.status === "active" && user.emailVerified && query.data?.id) {
      void api.post(`/matches/startup/${query.data.id}/events`, matchEventActionResponseSchema, { eventType: "view" }).catch(() => undefined);
    }
  }, [query.data?.id, user?.emailVerified, user?.role, user?.status]);
  if (query.isPending)
    return (
      <div role="status" className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading profile…
      </div>
    );
  if (query.isError) return <Unavailable />;
  const profile = query.data;
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <Avatar src={profile.avatarUrl} name={profile.name} />
          <div>
            <PageHeader
              title={profile.name}
              description={profile.oneLiner ?? "Startup profile"}
            />
          </div>
          {user?.role === "mentor" && user.status === "active" && user.emailVerified ? (
            <div className="sm:ml-auto"><InviteToConnect startupId={profile.id} startupName={profile.name} /></div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">About the startup</h2>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6">
            {profile.description || "No description provided."}
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Domains</h2>
          </CardHeader>
          <CardContent>
            <Tags values={profile.domains} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Stage</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{profile.stage ?? "Not provided"}</p>
          </CardContent>
        </Card>
      </div>
    </article>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    <img
      src={src}
      alt={`${name} profile`}
      className="size-24 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="grid size-24 shrink-0 place-items-center rounded-full bg-secondary">
      <UserRound className="size-10 text-muted-foreground" />
    </div>
  );
}
function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
    >
      {label}
      <ArrowUpRight className="size-3" />
    </a>
  );
}
function Unavailable() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="space-y-2 p-6">
        <h1 className="font-semibold">Profile unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This profile may be private, incomplete, or no longer available.
        </p>
      </CardContent>
    </Card>
  );
}
