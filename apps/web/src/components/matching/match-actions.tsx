"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { matchEventActionResponseSchema } from "@mentorloop/shared";
import { Button } from "@/components/ui/button";
import { ApiClientError, api } from "@/lib/api-client";

export function MatchActions({
  candidateType,
  candidateId,
  saved,
  onSaved,
  onDismissed,
}: {
  candidateType: "mentor" | "startup";
  candidateId: string;
  saved: boolean;
  onSaved: () => void;
  onDismissed: () => void;
}) {
  const [isSaved, setIsSaved] = useState(saved);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (input: { eventType: "save" | "dismiss"; dismissalReason?: string }) =>
      api.post(`/matches/${candidateType}/${candidateId}/events`, matchEventActionResponseSchema, input),
    onSuccess: (_data, input) => {
      if (input.eventType === "save") {
        setIsSaved(true);
        onSaved();
      } else {
        setDismissOpen(false);
        onDismissed();
      }
    },
  });
  useEffect(() => setIsSaved(saved), [saved]);

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={isSaved || mutation.isPending} onClick={() => mutation.mutate({ eventType: "save" })} aria-pressed={isSaved}>
        {mutation.isPending && mutation.variables?.eventType === "save" ? <Loader2 className="animate-spin" /> : <ThumbsUp />}{isSaved ? "Saved" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => { setReason(""); setDismissOpen(true); }}>
        <ThumbsDown />Dismiss
      </Button>
    </div>
    {mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error instanceof ApiClientError ? mutation.error.message : "This action could not be saved. Try again."}</p> : null}
    {dismissOpen ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDismissOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={`dismiss-title-${candidateId}`} className="w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id={`dismiss-title-${candidateId}`} className="font-semibold">Dismiss this recommendation?</h2><p className="mt-1 text-sm text-muted-foreground">It will be hidden from your discovery results. You can optionally tell us why.</p></div><Button variant="ghost" size="icon" aria-label="Close dismissal" onClick={() => setDismissOpen(false)}><X /></Button></div>
        <label htmlFor={`dismiss-reason-${candidateId}`} className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id={`dismiss-reason-${candidateId}`} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Not the right domain, stage, or fit…" />
        {mutation.isError ? <p role="alert" className="mt-2 text-sm text-destructive">{mutation.error instanceof ApiClientError ? mutation.error.message : "The recommendation could not be dismissed. Try again."}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => setDismissOpen(false)}>Cancel</Button><Button variant="destructive" disabled={mutation.isPending || (!!reason.trim() && reason.trim().length < 3)} onClick={() => mutation.mutate({ eventType: "dismiss", ...(reason.trim() ? { dismissalReason: reason.trim() } : {}) })}>{mutation.isPending && mutation.variables?.eventType === "dismiss" ? <Loader2 className="animate-spin" /> : <ThumbsDown />}Dismiss match</Button></div>
      </section>
    </div> : null}
  </div>;
}
