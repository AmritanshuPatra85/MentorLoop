"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { connectionResponseSchema } from "@mentorloop/shared";
import { ApiClientError, api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function RequestToConnect({ startupId, startupName, mentorId, mentorName }: {
  startupId: string; startupName: string; mentorId: string; mentorName: string;
}) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [sent, setSent] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.post("/connections/requests", connectionResponseSchema, { startupId, mentorId, introMessage: message.trim() }),
    onSuccess: () => { setSent(true); setOpen(false); },
  });
  if (sent) return <Button size="sm" variant="outline" disabled>Request sent</Button>;
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Send aria-hidden="true" />Request connection</Button>
    {open ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="connection-request-title" className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="connection-request-title" className="text-lg font-semibold">Request {mentorName}</h2><p className="mt-1 text-sm text-muted-foreground">Introduce {startupName} and share what you would like help with.</p></div><Button variant="ghost" size="icon" aria-label="Close request" onClick={() => setOpen(false)}><X /></Button></div>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <label htmlFor="connection-request-message" className="text-sm font-medium">Introduction</label>
          <textarea id="connection-request-message" required minLength={20} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell the mentor what your startup is working on and what guidance would help." className="min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p className="text-xs text-muted-foreground">20–1,000 characters · {message.trim().length}/1,000</p>
          {mutation.isError ? <p role="alert" className="text-sm text-destructive">{mutation.error instanceof ApiClientError ? mutation.error.message : "Your request could not be sent. Try again."}</p> : null}
          <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending || message.trim().length < 20}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}Send request</Button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
