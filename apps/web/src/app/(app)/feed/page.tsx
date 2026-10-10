"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Compass } from "lucide-react";
import { matchingWithStartupsResponseSchema } from "@mentorloop/shared";
import type { MatchResultWithStartup } from "@mentorloop/shared";
import { InviteToConnect } from "@/components/connections/invite-to-connect";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { MatchActions } from "@/components/matching/match-actions";

export default function StartupFeedPage() {
  const query = useQuery({
    queryKey: ["matches", "startups"],
    queryFn: () => api.get("/matches/startups", matchingWithStartupsResponseSchema),
  });
  const queryClient = useQueryClient();
  const matches = query.data?.matches ?? [];

  return <>
    <PageHeader title="Startup feed" description="Startups ranked by how well they fit your expertise and availability." />
    {query.isPending ? <ListSkeleton rows={5} /> : null}
    {query.isError ? <ErrorState title="Startup feed could not be loaded" message="Check your connection and try loading the feed again." onRetry={() => void query.refetch()} /> : null}
    {query.isSuccess && matches.length === 0 ? <EmptyState icon={Compass} title="No startup matches yet" description="New eligible startups will appear here as their profiles and your availability match." /> : null}
    {matches.length ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{matches.length} recommended {matches.length === 1 ? "startup" : "startups"}</p>
      {matches.map((match, index) => {
        const startup = match.startup;
        const score = Math.round(match.score * 100);
        return <Card key={match.candidateId} className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-muted-foreground sm:size-16">
              {startup.avatarUrl ? <img src={startup.avatarUrl} alt="" className="size-full object-cover" /> : <Building2 className="size-7" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">#{index + 1} match</span><Badge variant="success">{score}% fit</Badge>{startup.stage ? <Badge variant="outline">{startup.stage}</Badge> : null}</div>
              <h2 className="mt-1 truncate text-lg font-semibold">{startup.name}</h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">{startup.oneLiner || startup.description || "The founders have not added a short description yet."}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{startup.domains.slice(0, 4).map((domain) => <Badge key={domain} variant="secondary">{domain}</Badge>)}{startup.domains.length > 4 ? <Badge variant="outline">+{startup.domains.length - 4}</Badge> : null}</div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-48">
              <InviteToConnect startupId={startup.id} startupName={startup.name} size="sm" />
              <MatchActions candidateType="startup" candidateId={startup.id} saved={match.saved} onSaved={() => { queryClient.setQueryData(["matches", "startups"], (current: { matches: MatchResultWithStartup[] } | undefined) => current ? { ...current, matches: current.matches.map((item) => item.candidateId === match.candidateId ? { ...item, saved: true } : item) } : current); void queryClient.invalidateQueries({ queryKey: ["matches", "startups"] }); }} onDismissed={() => { queryClient.setQueryData(["matches", "startups"], (current: { matches: MatchResultWithStartup[] } | undefined) => current ? { ...current, matches: current.matches.filter((item) => item.candidateId !== match.candidateId) } : current); void queryClient.invalidateQueries({ queryKey: ["matches", "startups"] }); }} />
              <Link href={`/startups/${startup.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View startup <ArrowRight className="size-4" /></Link>
            </div>
          </CardContent>
        </Card>;
      })}
    </div> : null}
  </>;
}
