"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { connectionActionItemsResponseSchema, sessionActionItemSchema, type SessionActionItem } from "@mentorloop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/common/error-state";
import { ActionItemFilters, SavedActionItem } from "@/components/sessions/session-action-items";
import { api } from "@/lib/api-client";

export function ConnectionActionItems({ connectionId }: { connectionId: string }) {
  const cache = useQueryClient();
  const [filters, setFilters] = useState({ status: "", owner: "", overdue: "" });
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => !!value).map(([key, value]) => [key, value]));
  const query = useQuery({
    queryKey: ["connection-action-items", connectionId, filters],
    queryFn: () => api.get(`/connections/${connectionId}/action-items${params.size ? `?${params}` : ""}`, connectionActionItemsResponseSchema),
  });
  const update = useMutation({
    mutationFn: ({ item, fields }: { item: SessionActionItem; fields: Partial<Pick<SessionActionItem, "status" | "owner" | "dueDate" | "priority" | "title" | "description">> }) =>
      api.patch(`/sessions-api/${item.sessionId}/action-items/${item.id}`, sessionActionItemSchema, { ...fields, expectedUpdatedAt: item.updatedAt }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ["connection-action-items", connectionId] }); void cache.invalidateQueries({ queryKey: ["session-action-items"] }); },
  });
  const summary = query.data?.summary;

  return <section className="space-y-4" aria-labelledby="connection-actions-title">
    <div><h2 id="connection-actions-title" className="text-lg font-semibold">Shared action items</h2><p className="text-sm text-muted-foreground">Commitments from every session in this connection.</p></div>
    {query.isPending ? <Card><CardContent className="p-5">Loading action item progress…</CardContent></Card> : null}
    {query.isError ? <ErrorState title="Action items could not be loaded" message={query.error.message} onRetry={() => void query.refetch()} /> : null}
    {summary ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary label="Total" value={summary.total} />
      <Summary label="Open" value={summary.open} />
      <Summary label="In progress" value={summary.inProgress} />
      <Summary label="Completed" value={`${summary.done} · ${summary.completionPercentage}%`} />
      <Summary label="Blocked" value={summary.blocked} />
      <Summary label="Overdue" value={summary.overdue} alert={summary.overdue > 0} />
      <Card className="sm:col-span-2"><CardContent className="space-y-2 p-4"><div className="flex justify-between text-sm"><span>Completion</span><span>{summary.completionPercentage}%</span></div><div role="progressbar" aria-label="Action item completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.completionPercentage} className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${summary.completionPercentage}%` }} /></div></CardContent></Card>
    </div> : null}
    {query.data ? <>
      <ActionItemFilters filters={filters} onChange={setFilters} />
      {query.data.actionItems.length === 0 ? <Card><CardContent className="p-5 text-sm text-muted-foreground">No action items match these filters.</CardContent></Card> : <div className="space-y-3">{query.data.actionItems.map((item) => <div key={item.id} className="space-y-1"><SavedActionItem item={item} disabled={update.isPending} onChange={(fields) => update.mutate({ item, fields })} /><p className="px-1 text-xs text-muted-foreground">From session <Link className="text-primary underline" href={`/sessions/${item.sessionId}`}>view session</Link></p></div>)}</div>}
      {update.isError ? <p role="alert" className="text-sm text-destructive">{update.error.message}. Refresh the connection to load current values.</p> : null}
    </> : null}
  </section>;
}

function Summary({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold ${alert ? "text-destructive" : ""}`}>{value}</p></CardContent></Card>;
}
