"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Link2, UserRound } from "lucide-react";
import { connectionInboxResponseSchema, connectionResponseSchema } from "@mentorloop/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";

const pendingStates = new Set(["requested", "invited"]);

export default function ConnectionsPage() {
  const { user } = useAuth(); const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["connections", "all"], queryFn: () => api.get("/connections/all", connectionInboxResponseSchema) });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" }) => api.post("/connections/" + id + "/respond", connectionResponseSchema, { action }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["connections", "all"] }); },
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post("/connections/" + id + "/withdraw", connectionResponseSchema),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["connections", "all"] }); },
  });
  const items = query.data?.connections ?? [];

  return <>
    <PageHeader title="Connections" description="Manage requests and invitations, and schedule with mentors and founders you’ve connected with." />
    {query.isPending ? <ListSkeleton rows={3} /> : null}
    {query.isError ? <ErrorState title="Connections could not be loaded" message="Check your connection and try again." onRetry={() => void query.refetch()} /> : null}
    {query.isSuccess && items.length === 0 ? <EmptyState icon={Inbox} title="No connections yet" description="Requests and invitations will appear here. Discover a match to start a conversation." /> : null}
    {items.length ? <div className="space-y-3">
      {items.map((connection) => {
        const outgoing = connection.initiatedBy === user?.id;
        const pending = pendingStates.has(connection.state);
        const title = user?.role === "founder" ? connection.mentorName : connection.startupName;
        return <Card key={connection.id}><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
          {user?.role === "founder" && connection.mentorAvatarUrl ? <img src={connection.mentorAvatarUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" /> : <div className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><UserRound className="size-6" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{title}</h2><Badge variant={connection.state === "accepted" ? "success" : connection.state === "declined" ? "destructive" : "info"}>{connection.state.replaceAll("_", " ")}</Badge>{pending ? <Badge variant="outline">{outgoing ? "Sent by you" : "Needs your response"}</Badge> : null}</div>
            <p className="text-sm text-muted-foreground">{user?.role === "founder" ? [connection.currentRole, connection.organization].filter(Boolean).join(" · ") || "Mentor" : connection.mentorName + " · " + connection.startupName}</p>
            {connection.introMessage ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{connection.introMessage}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">Started {new Date(connection.createdAt).toLocaleString()}{connection.expiresAt && pending ? " · Expires " + new Date(connection.expiresAt).toLocaleString() : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {connection.state === "accepted" ? <Link href={"/sessions?connectionId=" + connection.id} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Link2 aria-hidden="true" className="size-4" />Schedule session</Link> : null}
            {pending && !outgoing ? <><Button size="sm" onClick={() => transition.mutate({ id: connection.id, action: "accept" })} disabled={transition.isPending}>Accept</Button><Button size="sm" variant="outline" onClick={() => transition.mutate({ id: connection.id, action: "decline" })} disabled={transition.isPending}>Decline</Button></> : null}
            {pending && outgoing ? <Button size="sm" variant="outline" onClick={() => withdraw.mutate(connection.id)} disabled={withdraw.isPending}>Withdraw</Button> : null}
          </div>
        </CardContent></Card>;
      })}
      {transition.isError || withdraw.isError ? <p role="alert" className="text-sm text-destructive">{(transition.error ?? withdraw.error) instanceof Error ? (transition.error ?? withdraw.error)?.message : "The connection action failed."}</p> : null}
    </div> : null}
  </>;
}
