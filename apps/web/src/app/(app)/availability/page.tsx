"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { availabilityResponseSchema, availabilityUpdateSchema } from "@mentorloop/shared";
import { z } from "zod";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Availability = z.infer<typeof availabilityResponseSchema>;
type Update = z.infer<typeof availabilityUpdateSchema>;

export default function AvailabilityPage() {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Update | null>(null);
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const query = useQuery({ queryKey: ["availability"], queryFn: () => api.get("/availability/me", availabilityResponseSchema) });
  useEffect(() => {
    if (draft || !query.data) return;
    setDraft({ timezone: query.data.timezone, sessionLengthMinutes: query.data.sessionLengthMinutes, bufferMinutes: query.data.bufferMinutes, minimumNoticeMinutes: query.data.minimumNoticeMinutes, rules: query.data.rules.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })) });
  }, [draft, query.data]);
  const save = useMutation({ mutationFn: (input: Update) => api.put("/availability/me", availabilityResponseSchema, input), onSuccess: (data) => { setDraft({ timezone: data.timezone, sessionLengthMinutes: data.sessionLengthMinutes, bufferMinutes: data.bufferMinutes, minimumNoticeMinutes: data.minimumNoticeMinutes, rules: data.rules.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })) }); void cache.invalidateQueries({ queryKey: ["availability"] }); } });
  const addException = useMutation({ mutationFn: (input: { startsAt: string; endsAt: string }) => api.post("/availability/me/exceptions", z.object({ id: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime() }), input), onSuccess: () => { setExceptionStart(""); setExceptionEnd(""); void cache.invalidateQueries({ queryKey: ["availability"] }); } });
  const removeException = useMutation({ mutationFn: (id: string) => api.delete("/availability/me/exceptions/" + id, z.undefined()), onSuccess: () => void cache.invalidateQueries({ queryKey: ["availability"] }) });
  const data: Availability | undefined = query.data;
  const form = draft ?? (data ? { timezone: data.timezone, sessionLengthMinutes: data.sessionLengthMinutes, bufferMinutes: data.bufferMinutes, minimumNoticeMinutes: data.minimumNoticeMinutes, rules: data.rules.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })) } : null);
  function updateRule(index: number, field: "startTime" | "endTime", value: string) { if (!form) return; setDraft({ ...form, rules: form.rules.map((rule, i) => i === index ? { ...rule, [field]: value } : rule) }); }
  return <>
    <PageHeader title="Availability" description="Set the real times founders can book. Preferred session times on your profile do not open booking slots." />
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading availability…</p> : null}
    {query.isError ? <p role="alert" className="text-sm text-destructive">Availability could not be loaded. Refresh and try again.</p> : null}
    {form ? <div className="space-y-5">
      <Card><CardHeader><h2 className="font-semibold">Weekly schedule</h2><p className="text-sm text-muted-foreground">Times are interpreted in your selected time zone.</p></CardHeader><CardContent className="space-y-4">
        <label className="block space-y-1 text-sm">Time zone<Input value={form.timezone} onChange={(e) => setDraft({ ...form, timezone: e.target.value })} placeholder="Asia/Kolkata" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">Session length (minutes)<Input type="number" min={15} max={240} value={form.sessionLengthMinutes} onChange={(e) => setDraft({ ...form, sessionLengthMinutes: Number(e.target.value) })} /></label>
          <label className="space-y-1 text-sm">Buffer (minutes)<Input type="number" min={0} max={120} value={form.bufferMinutes} onChange={(e) => setDraft({ ...form, bufferMinutes: Number(e.target.value) })} /></label>
          <label className="space-y-1 text-sm">Minimum notice (minutes)<Input type="number" min={0} max={10080} value={form.minimumNoticeMinutes} onChange={(e) => setDraft({ ...form, minimumNoticeMinutes: Number(e.target.value) })} /></label>
        </div>
        <div className="space-y-3">{form.rules.map((rule, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <label className="space-y-1 text-sm">Day<select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={rule.dayOfWeek} onChange={(e) => setDraft({ ...form, rules: form.rules.map((r, i) => i === index ? { ...r, dayOfWeek: Number(e.target.value) } : r) })}>{weekdays.map((day, n) => <option key={day} value={n}>{day}</option>)}</select></label>
          <label className="space-y-1 text-sm">From<Input type="time" value={rule.startTime} onChange={(e) => updateRule(index, "startTime", e.target.value)} /></label>
          <label className="space-y-1 text-sm">To<Input type="time" value={rule.endTime} onChange={(e) => updateRule(index, "endTime", e.target.value)} /></label>
          <Button type="button" variant="outline" size="icon" aria-label="Remove time window" onClick={() => setDraft({ ...form, rules: form.rules.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button>
        </div>)}</div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setDraft({ ...form, rules: [...form.rules, { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }] })}><Plus className="mr-2 size-4" />Add time window</Button><Button onClick={() => save.mutate(form)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save availability"}</Button></div>
        {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error.message}</p> : null}
      </CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Unavailable dates</h2><p className="text-sm text-muted-foreground">Add a one-off period that should be excluded from bookable times.</p></CardHeader><CardContent className="space-y-4">
        {data?.exceptions.map((exception) => <div key={exception.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span>{new Date(exception.startsAt).toLocaleString()} – {new Date(exception.endsAt).toLocaleString()}</span><Button variant="outline" size="sm" onClick={() => removeException.mutate(exception.id)}>Remove</Button></div>)}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-1 text-sm">Starts<Input type="datetime-local" value={exceptionStart} onChange={(e) => setExceptionStart(e.target.value)} /></label><label className="space-y-1 text-sm">Ends<Input type="datetime-local" value={exceptionEnd} onChange={(e) => setExceptionEnd(e.target.value)} /></label><Button className="self-end" onClick={() => addException.mutate({ startsAt: new Date(exceptionStart).toISOString(), endsAt: new Date(exceptionEnd).toISOString() })} disabled={!exceptionStart || !exceptionEnd || addException.isPending}><CalendarClock className="mr-2 size-4" />Add exception</Button></div>
        {addException.isError || removeException.isError ? <p role="alert" className="text-sm text-destructive">The unavailable period could not be updated.</p> : null}
      </CardContent></Card>
    </div> : null}
  </>;
}
