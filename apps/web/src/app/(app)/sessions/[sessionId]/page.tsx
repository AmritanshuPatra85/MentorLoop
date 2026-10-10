"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { googleCalendarEventResponseSchema, sessionDetailResponseSchema, sessionSchema } from "@mentorloop/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { downloadApiFile, api } from "@/lib/api-client";

export default function SessionDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ sessionId: string }>(); const id = params.sessionId; const cache = useQueryClient();
  const [reason, setReason] = useState(""); const [meetingUrl, setMeetingUrl] = useState(""); const [googleCalendarUrl, setGoogleCalendarUrl] = useState("");
  const query = useQuery({ queryKey: ["session", id], queryFn: () => api.get(`/sessions-api/${id}`, sessionDetailResponseSchema) });
  const action = useMutation({ mutationFn: (input: { action: "cancel" | "complete" | "no_show"; reason?: string }) => api.post(`/sessions-api/${id}/actions`, sessionSchema, input), onSuccess: () => { void cache.invalidateQueries({ queryKey: ["session", id] }); void cache.invalidateQueries({ queryKey: ["sessions"] }); } });
  const linkUpdate = useMutation({ mutationFn: (input: { meetingUrl: string }) => api.patch(`/sessions-api/${id}/meeting-link`, sessionSchema, input), onSuccess: (session) => { setMeetingUrl(session.meetingUrl ?? ""); void cache.invalidateQueries({ queryKey: ["session", id] }); void cache.invalidateQueries({ queryKey: ["sessions"] }); } });
  const google = useMutation({ mutationFn: () => api.post(`/calendar/sessions/${id}/google-event`, googleCalendarEventResponseSchema), onSuccess: (event) => { if (event.meetingUrl) setMeetingUrl(event.meetingUrl); if (event.calendarUrl) setGoogleCalendarUrl(event.calendarUrl); void cache.invalidateQueries({ queryKey: ["session", id] }); void cache.invalidateQueries({ queryKey: ["sessions"] }); } });
  const session = query.data?.session; const active = session && ["scheduled", "rescheduled"].includes(session.status);
  return <>
    <PageHeader title="Session details" description="Review the meeting details, history, and available actions." />
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading session…</p> : null}
    {query.isError ? <p role="alert" className="text-sm text-destructive">Session could not be loaded. {query.error.message}</p> : null}
    {session ? <div className="space-y-5">
      <Card><CardContent className="space-y-3 p-5"><h2 className="text-lg font-semibold">{session.startupName} · {session.mentorName}</h2><p>{new Date(session.startsAt).toLocaleString()} – {new Date(session.endsAt).toLocaleTimeString()} ({session.mentorTimezone})</p><p className="text-sm text-muted-foreground">Status: {session.status.replaceAll("_", " ")}</p>
        {session.meetingUrl ? <a className="break-all text-primary underline" href={session.meetingUrl} target="_blank" rel="noreferrer">{session.meetingUrl}</a> : null}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void downloadApiFile(`/sessions-api/${id}/calendar.ics`, `mentorloop-session-${id}.ics`)}>Download calendar file</Button>{active && <Link href={`/sessions?connectionId=${session.connectionId}&rescheduleId=${session.id}`} className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium">Reschedule</Link>}</div>
      </CardContent></Card>
      {active ? <Card><CardContent className="space-y-3 p-4"><h3 className="font-semibold">Meeting link</h3><div className="flex flex-col gap-2 sm:flex-row"><Input type="url" placeholder="https://…" value={meetingUrl || session.meetingUrl || ""} onChange={(event) => setMeetingUrl(event.target.value)} /><Button variant="outline" disabled={!meetingUrl.startsWith("https://") || linkUpdate.isPending} onClick={() => linkUpdate.mutate({ meetingUrl })}>Save link</Button><Button variant="outline" disabled={google.isPending} onClick={() => google.mutate()}>Add to Google Calendar</Button></div>{googleCalendarUrl ? <a className="text-sm text-primary underline" href={googleCalendarUrl} target="_blank" rel="noreferrer">Open calendar event</a> : null}{linkUpdate.isError || google.isError ? <p role="alert" className="text-sm text-destructive">{(linkUpdate.error ?? google.error)?.message}</p> : null}<label className="block space-y-1 text-sm">Action reason<Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for cancellation" /></label><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={reason.trim().length < 3 || action.isPending} onClick={() => action.mutate({ action: "cancel", reason })}>Cancel session</Button><Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "complete" })}>Mark complete</Button>{user?.role === "mentor" ? <Button variant="outline" disabled={reason.trim().length < 3 || action.isPending} onClick={() => action.mutate({ action: "no_show", reason })}>Mark no-show</Button> : null}</div>{action.isError ? <p role="alert" className="text-sm text-destructive">{action.error.message}</p> : null}</CardContent></Card> : null}
      <section className="space-y-3"><h3 className="font-semibold">Session history</h3>{query.data?.history.map((event) => <Card key={event.id}><CardContent className="p-4"><p className="font-medium">{event.eventType.replaceAll("_", " ")}</p><p className="text-sm text-muted-foreground">{new Date(event.createdAt).toLocaleString()} · {event.actorName ?? "System"}{event.reason ? ` · ${event.reason}` : ""}</p></CardContent></Card>)}</section>
    </div> : null}
  </>;
}
