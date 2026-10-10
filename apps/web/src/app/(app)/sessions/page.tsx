"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { availableSlotsResponseSchema, calendarConnectionResponseSchema, connectionInboxResponseSchema, sessionListResponseSchema, sessionSchema } from "@mentorloop/shared";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

const dayRange = () => { const from = Date.now(); return { from: new Date(from).toISOString(), to: new Date(from + 14 * 86400000 - 1000).toISOString() }; };
function dateLabel(iso: string) { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }

export default function SessionsPage() {
  const search = useSearchParams(); const connectionId = search.get("connectionId"); const rescheduleId = search.get("rescheduleId");
  const cache = useQueryClient(); const [meetingUrl, setMeetingUrl] = useState(""); const [selected, setSelected] = useState("");
  const list = useQuery({ queryKey: ["sessions"], queryFn: () => api.get("/sessions-api", sessionListResponseSchema) });
  const connections = useQuery({ queryKey: ["connections", "all"], queryFn: () => api.get("/connections/all", connectionInboxResponseSchema), enabled: !!connectionId });
  const activeConnection = connections.data?.connections.find((connection) => connection.id === connectionId && connection.state === "accepted");
  const range = dayRange();
  const slots = useQuery({ queryKey: ["slots", connectionId, range.from.slice(0, 10)], enabled: !!activeConnection, queryFn: () => api.get(`/availability/connections/${connectionId}/slots?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}`, availableSlotsResponseSchema) });
  const booking = useMutation({ mutationFn: (input: { connectionId: string; startsAt: string; meetingUrl: string; idempotencyKey: string }) => api.post("/sessions-api", sessionSchema, input), onSuccess: () => { void cache.invalidateQueries({ queryKey: ["sessions"] }); void cache.invalidateQueries({ queryKey: ["slots"] }); } });
  const reschedule = useMutation({ mutationFn: (input: { startsAt: string; reason: string; meetingUrl?: string }) => api.post(`/sessions-api/${rescheduleId}/reschedule`, sessionSchema, input), onSuccess: () => { void cache.invalidateQueries({ queryKey: ["sessions"] }); void cache.invalidateQueries({ queryKey: ["session", rescheduleId] }); void cache.invalidateQueries({ queryKey: ["slots"] }); } });
  const itemToReschedule = list.data?.sessions.find((session) => session.id === rescheduleId);
  const connectStatus = search.get("calendar");
  const google = useMutation({ mutationFn: () => api.post("/calendar/google/connect", z.object({ authorizationUrl: z.string().url() }), {}), onSuccess: ({ authorizationUrl }) => { window.location.assign(authorizationUrl); } });
  const calendarStatus = useQuery({ queryKey: ["google-calendar"], queryFn: () => api.get("/calendar/google/status", calendarConnectionResponseSchema) });
  const disconnectGoogle = useMutation({ mutationFn: () => api.delete("/calendar/google", calendarConnectionResponseSchema), onSuccess: () => void cache.invalidateQueries({ queryKey: ["google-calendar"] }) });

  return <>
    <PageHeader title="Sessions" description="Book and manage sessions with your accepted connections." />
    {connectStatus === "connected" ? <p role="status" className="mb-4 text-sm text-green-700">Google Calendar connected. You can add a session event from its details.</p> : null}
    {connectStatus === "error" ? <p role="alert" className="mb-4 text-sm text-destructive">Google Calendar could not be connected. You can still use the calendar download and meeting-link options.</p> : null}
    {calendarStatus.data?.connected ? <div className="mb-4 flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">Google Calendar is connected. Events are added only when you choose to sync a session.</p><Button variant="outline" size="sm" onClick={() => disconnectGoogle.mutate()} disabled={disconnectGoogle.isPending}>{disconnectGoogle.isPending ? "Disconnecting…" : "Disconnect"}</Button></div> : <Button className="mb-4" variant="outline" onClick={() => google.mutate()} disabled={google.isPending}>Connect Google Calendar</Button>}
    {disconnectGoogle.isError ? <p role="alert" className="mb-3 text-sm text-destructive">Calendar disconnect failed.</p> : null}
    {google.isError ? <p role="alert" className="mb-4 text-sm text-destructive">{google.error.message}</p> : null}
    {connectionId ? <Card className="mb-6"><CardContent className="space-y-4 p-4 sm:p-5">
      <div><h2 className="font-semibold">{rescheduleId ? "Choose a new time" : "Choose a session time"}</h2><p className="text-sm text-muted-foreground">Times shown in your browser’s local time zone. Availability is based on the mentor’s real schedule.</p></div>
      {connections.isPending || list.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {activeConnection && !slots.data?.slots.length && !slots.isPending ? <p className="text-sm text-muted-foreground">No bookable times are available in the next 14 days.</p> : null}
      {slots.isError ? <p role="alert" className="text-sm text-destructive">{slots.error.message}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{slots.data?.slots.map((slot) => <Button key={slot.startsAt} type="button" variant={selected === slot.startsAt ? "default" : "outline"} onClick={() => setSelected(slot.startsAt)}>{dateLabel(slot.startsAt)}</Button>)}</div>
      {activeConnection ? <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="space-y-1 text-sm">Secure meeting URL<Input type="url" required placeholder="https://…" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} /></label><Button className="self-end" disabled={!selected || !meetingUrl.startsWith("https://") || booking.isPending || reschedule.isPending} onClick={() => rescheduleId ? reschedule.mutate({ startsAt: selected, reason: "Rescheduled by participant", meetingUrl }) : booking.mutate({ connectionId: activeConnection.id, startsAt: selected, meetingUrl, idempotencyKey: crypto.randomUUID() })}>{rescheduleId ? "Reschedule session" : "Book session"}</Button></div> : !connections.isPending ? <p role="alert" className="text-sm text-destructive">This accepted connection could not be found.</p> : null}
      {booking.isError || reschedule.isError ? <p role="alert" className="text-sm text-destructive">{(booking.error ?? reschedule.error)?.message}</p> : null}
      {booking.isSuccess || reschedule.isSuccess ? <p role="status" className="text-sm text-green-700">Session saved. <Link className="underline" href={`/sessions/${(booking.data ?? reschedule.data)?.id}`}>View details</Link></p> : null}
      {rescheduleId && itemToReschedule ? <p className="text-xs text-muted-foreground">Current time: {dateLabel(itemToReschedule.startsAt)}</p> : null}
    </CardContent></Card> : null}
    {list.isError ? <p role="alert" className="text-sm text-destructive">Sessions could not be loaded. {list.error.message}</p> : null}
    {!list.isPending && list.data?.sessions.length === 0 ? <EmptyState icon={CalendarDays} title="No sessions yet" description="Accepted connections can book a session using the Schedule session link." /> : null}
    <div className="space-y-3">{list.data?.sessions.map((session) => <Card key={session.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-4"><div><div className="font-medium">{session.startupName} · {session.mentorName}</div><div className="text-sm text-muted-foreground">{dateLabel(session.startsAt)} · {session.status.replaceAll("_", " ")}</div></div><Link href={`/sessions/${session.id}`} className="text-sm font-medium text-primary underline">View session</Link></CardContent></Card>)}</div>
  </>;
}
