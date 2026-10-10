"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { sessionBriefInputSchema, sessionBriefResponseSchema } from "@mentorloop/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { SessionBriefDigest } from "./session-brief-digest";

type BriefFields = { currentStatus: string; specificQuestions: string; desiredOutcome: string };
const emptyFields: BriefFields = { currentStatus: "", specificQuestions: "", desiredOutcome: "" };
const briefFields = (brief: NonNullable<Awaited<ReturnType<typeof loadBrief>>>) => ({
  currentStatus: brief.currentStatus, specificQuestions: brief.specificQuestions, desiredOutcome: brief.desiredOutcome,
});
async function loadBrief(sessionId: string) {
  const result = await api.get(`/sessions-api/${sessionId}/brief`, sessionBriefResponseSchema);
  return result.brief;
}

export function SessionBriefPanel({ sessionId, sessionStatus, startsAt }: { sessionId: string; sessionStatus: string; startsAt: string }) {
  const { user } = useAuth(); const cache = useQueryClient();
  const [draft, setDraft] = useState<BriefFields | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const query = useQuery({
    queryKey: ["session-brief", sessionId],
    queryFn: () => loadBrief(sessionId),
    refetchInterval: (current) => isVisible && current.state.data?.digestStatus === "pending" ? 2500 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const updateVisibility = () => setIsVisible(document.visibilityState === "visible");
    updateVisibility(); document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);
  useEffect(() => {
    if (draft || !query.data) return;
    setDraft(query.data ? briefFields(query.data) : emptyFields);
  }, [draft, query.data]);
  const save = useMutation({
    mutationFn: (input: BriefFields) => api.put(`/sessions-api/${sessionId}/brief`, sessionBriefResponseSchema, input),
    onSuccess: (response) => {
      if (response.brief) setDraft(briefFields(response.brief));
      setErrors([]);
      void cache.invalidateQueries({ queryKey: ["session-brief", sessionId] });
    },
  });
  const brief = query.data;
  const canEdit = user?.role === "founder" && ["scheduled", "rescheduled"].includes(sessionStatus) && Date.parse(startsAt) > Date.now();

  function update(field: keyof BriefFields, value: string) {
    setDraft((current) => ({ ...(current ?? (brief ? briefFields(brief) : emptyFields)), [field]: value }));
  }
  function submit() {
    const parsed = sessionBriefInputSchema.safeParse(draft ?? emptyFields);
    if (!parsed.success) { setErrors(parsed.error.issues.map((issue) => issue.message)); return; }
    setErrors([]); save.mutate(parsed.data);
  }

  return <Card><CardContent className="space-y-4 p-4 sm:p-5">
    <div><h2 className="font-semibold">Pre-session brief</h2><p className="text-sm text-muted-foreground">A focused brief helps the mentor prepare for your session.</p></div>
    {query.isPending ? <p className="text-sm text-muted-foreground">Loading brief…</p> : null}
    {query.isError ? <p role="alert" className="text-sm text-destructive">The brief could not be loaded. {query.error.message}</p> : null}
    {user?.role === "founder" && canEdit ? <div className="space-y-3">
      <BriefField label="Current status" value={draft?.currentStatus ?? ""} onChange={(value) => update("currentStatus", value)} error={errors[0]} />
      <BriefField label="Specific questions" value={draft?.specificQuestions ?? ""} onChange={(value) => update("specificQuestions", value)} error={errors[1]} />
      <BriefField label="Desired outcome" value={draft?.desiredOutcome ?? ""} onChange={(value) => update("desiredOutcome", value)} error={errors[2]} />
      <div className="flex flex-wrap items-center gap-3"><Button onClick={submit} disabled={save.isPending || query.isPending}><Save className="mr-2 size-4" />{save.isPending ? "Saving…" : brief ? "Save changes" : "Save brief"}</Button>{brief?.digestStatus === "pending" ? <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />The mentor digest is generating.</span> : null}</div>
      {errors.length ? <p role="alert" className="text-sm text-destructive">{errors[0]}</p> : null}
      {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error.message}</p> : null}
    </div> : null}
    {user?.role === "founder" && !canEdit ? <p className="text-sm text-muted-foreground">{brief ? "This brief can no longer be edited because the session is no longer upcoming." : "A brief can be submitted before an upcoming scheduled session."}</p> : null}
    {user?.role === "mentor" ? brief ? <>
      {brief.digestStatus === "ready" && brief.digest ? <SessionBriefDigest digest={brief.digest} /> : null}
      {brief.digestStatus === "pending" ? <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Preparing the mentor digest…</p> : null}
      {brief.digestStatus === "failed" ? <p role="status" className="text-sm text-muted-foreground">AI digest unavailable. The founder’s brief is below.</p> : null}
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Founder’s original brief</summary><RawBrief brief={brief} /></details>
    </> : <p className="text-sm text-muted-foreground">The founder has not submitted a session brief yet.</p> : null}
    {user?.role === "founder" && brief && brief.digestStatus === "failed" ? <p role="status" className="text-sm text-muted-foreground">AI digest unavailable. Your saved brief is still available to the mentor.</p> : null}
  </CardContent></Card>;
}

function BriefField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return <label htmlFor={id} className="block space-y-1 text-sm font-medium">{label}
    <textarea id={id} maxLength={2000} required value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <span id={`${id}-count`} className="block text-right text-xs font-normal text-muted-foreground">{value.length}/2000</span>
    {error ? <span id={`${id}-error`} className="block text-xs font-normal text-destructive">{error}</span> : null}
  </label>;
}

function RawBrief({ brief }: { brief: NonNullable<Awaited<ReturnType<typeof loadBrief>>> }) {
  return <div className="mt-3 space-y-2 text-sm"><section><h3 className="font-medium">Current status</h3><p className="whitespace-pre-wrap">{brief.currentStatus}</p></section><section><h3 className="font-medium">Specific questions</h3><p className="whitespace-pre-wrap">{brief.specificQuestions}</p></section><section><h3 className="font-medium">Desired outcome</h3><p className="whitespace-pre-wrap">{brief.desiredOutcome}</p></section></div>;
}
