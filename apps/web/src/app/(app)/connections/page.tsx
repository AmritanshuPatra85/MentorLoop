"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox, UserRound } from "lucide-react";
import { incomingConnectionInvitesResponseSchema } from "@mentorloop/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";

export default function ConnectionsPage() {
  const { user } = useAuth();
  const founder = user?.role === "founder";
  const query = useQuery({
    queryKey: ["connections", "incoming"],
    queryFn: () => api.get("/connections/incoming", incomingConnectionInvitesResponseSchema),
    enabled: founder,
  });
  const invites = query.data?.invites ?? [];

  return <>
    <PageHeader title="Connections" description={founder ? "Invitations from mentors interested in supporting your startup." : "Your startup invitations are shown on the feed. Connection history will appear here."} />
    {founder && query.isPending ? <ListSkeleton rows={3} /> : null}
    {founder && query.isError ? <ErrorState title="Invitations could not be loaded" message="Check your connection and try again." onRetry={() => void query.refetch()} /> : null}
    {founder && query.isSuccess && invites.length === 0 ? <EmptyState icon={Inbox} title="No mentor invitations yet" description="When a mentor invites your startup to connect, you’ll see their message here." /> : null}
    {founder && invites.length > 0 ? <div className="space-y-3">
      {invites.map((invite) => <Card key={invite.id}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
        {invite.avatarUrl ? <img src={invite.avatarUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" /> : <div className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><UserRound className="size-6" /></div>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{invite.mentorName}</h2><Badge variant="info">Invitation</Badge></div><p className="text-sm text-muted-foreground">{[invite.currentRole, invite.organization].filter(Boolean).join(" · ") || "Mentor"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{invite.introMessage}</p><p className="mt-2 text-xs text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div>
        <Link href={`/mentors/${invite.mentorId}`} className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View mentor</Link>
      </CardContent></Card>)}
    </div> : null}
  </>;
}
