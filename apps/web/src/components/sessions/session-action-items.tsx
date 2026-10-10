"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  sessionActionItemExtractionResponseSchema,
  sessionActionItemSaveSchema,
  sessionActionItemsResponseSchema,
  sessionActionItemSchema,
  type SessionActionItemProposal,
  type SessionActionItem,
} from "@mentorloop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { createManualSessionActionItem, removeSessionActionItemProposal, updateSessionActionItemProposal } from "@/lib/session-action-items";

const NOTES_MAX_LENGTH = 16000;

export function SessionActionItems({ sessionId }: { sessionId: string }) {
  const cache = useQueryClient();
  const [notes, setNotes] = useState("");
  const [proposals, setProposals] = useState<SessionActionItemProposal[]>([]);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [filters, setFilters] = useState({ status: "", owner: "", overdue: "" });
  const filterParams = new URLSearchParams(Object.entries(filters).filter(([, value]) => !!value).map(([key, value]) => [key, value]));
  const savedQuery = useQuery({ queryKey: ["session-action-items", sessionId, filters], queryFn: () => api.get(`/sessions-api/${sessionId}/action-items${filterParams.size ? `?${filterParams}` : ""}`, sessionActionItemsResponseSchema) });
  const update = useMutation({
    mutationFn: ({ item, fields }: { item: SessionActionItem; fields: Partial<Pick<SessionActionItem, "status" | "owner" | "dueDate" | "priority" | "title" | "description">> }) => api.patch(`/sessions-api/${sessionId}/action-items/${item.id}`, sessionActionItemSchema, { ...fields, expectedUpdatedAt: item.updatedAt }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ["session-action-items", sessionId] }); void cache.invalidateQueries({ queryKey: ["connection-action-items"] }); },
  });
  const extraction = useMutation({
    mutationFn: (input: { notes: string }) => api.post(`/sessions-api/${sessionId}/action-items/extract`, sessionActionItemExtractionResponseSchema, input),
    onSuccess: ({ actionItems }) => { setProposals(actionItems); setReviewOpen(true); setReviewError(""); },
  });
  const save = useMutation({
    mutationFn: (input: { submissionId: string; actionItems: SessionActionItemProposal[] }) => {
      const parsed = sessionActionItemSaveSchema.safeParse({
        submissionId: input.submissionId,
        actionItems: input.actionItems.map(({ title, description, owner, dueDate, priority }) => ({ title, description, owner, dueDate, priority })),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Review each action item before saving");
      return api.post(`/sessions-api/${sessionId}/action-items`, sessionActionItemsResponseSchema, parsed.data);
    },
    onSuccess: () => {
      setProposals([]); setReviewOpen(false); setSubmissionId(crypto.randomUUID()); setReviewError("");
      void cache.invalidateQueries({ queryKey: ["session-action-items", sessionId] });
    },
  });

  function addItem() {
    setProposals((items) => items.length >= 20 ? items : [...items, createManualSessionActionItem()]);
    setReviewOpen(true); setReviewError("");
  }
  function updateItem(index: number, patch: Partial<SessionActionItemProposal>) {
    setProposals((items) => updateSessionActionItemProposal(items, index, patch));
  }
  function removeItem(index: number) {
    setProposals((items) => removeSessionActionItemProposal(items, index));
  }
  function saveReviewedItems() {
    const validation = sessionActionItemSaveSchema.safeParse({
      submissionId,
      actionItems: proposals.map(({ title, description, owner, dueDate, priority }) => ({ title, description, owner, dueDate, priority })),
    });
    if (!validation.success) { setReviewError(validation.error.issues[0]?.message ?? "Review each action item before saving"); return; }
    setReviewError(""); save.mutate({ submissionId, actionItems: proposals });
  }

  return <Card><CardContent className="space-y-5 p-4 sm:p-5">
    <div><h2 className="font-semibold">Notes to action items</h2><p className="text-sm text-muted-foreground">Paste session notes to draft commitments. Nothing is saved until you review and approve the items.</p></div>
    <div className="space-y-2">
      <label htmlFor="session-notes" className="text-sm font-medium">Session notes</label>
      <textarea id="session-notes" maxLength={NOTES_MAX_LENGTH} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Paste notes from your mentoring session…" className="min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Notes are sent securely for extraction and are not stored.</span><span className="text-xs text-muted-foreground">{notes.length}/{NOTES_MAX_LENGTH}</span></div>
      <Button onClick={() => extraction.mutate({ notes })} disabled={!notes.trim() || notes.length > NOTES_MAX_LENGTH || extraction.isPending}>
        {extraction.isPending ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        {extraction.isPending ? "Extracting…" : "Extract action items"}
      </Button>
      {extraction.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{extraction.error.message}. Your notes are still here.</p><Button type="button" variant="outline" onClick={() => extraction.mutate({ notes })} disabled={!notes.trim() || extraction.isPending}>Retry extraction</Button></div> : null}
    </div>

    {reviewOpen ? <section className="space-y-4 border-t pt-4" aria-labelledby="action-item-review-title">
      <div><h3 id="action-item-review-title" className="font-semibold">Review action items</h3><p className="text-sm text-muted-foreground">Edit or remove suggestions, or add an item before saving.</p></div>
      {proposals.length === 0 ? <p className="text-sm text-muted-foreground">No clear commitments were found. You can add one manually.</p> : null}
      <div className="space-y-4">{proposals.map((item, index) => <ActionItemEditor key={`${index}-${item.title}`} item={item} index={index} onChange={(patch) => updateItem(index, patch)} onRemove={() => removeItem(index)} />)}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={addItem} disabled={proposals.length >= 20}><Plus className="mr-2 size-4" />Add manually</Button>
        <Button type="button" onClick={saveReviewedItems} disabled={!proposals.length || save.isPending}>{save.isPending ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}{save.isPending ? "Saving…" : "Approve and save"}</Button>
      </div>
      {reviewError ? <p role="alert" className="text-sm text-destructive">{reviewError}</p> : null}
      {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error.message}. Your reviewed items are still here, so you can retry.</p> : null}
    </section> : <Button type="button" variant="outline" onClick={addItem}><Plus className="mr-2 size-4" />Add an action item manually</Button>}

    <section className="space-y-3 border-t pt-4" aria-labelledby="saved-action-items-title">
      <h3 id="saved-action-items-title" className="font-semibold">Saved action items</h3>
      <ActionItemFilters filters={filters} onChange={setFilters} />
      {savedQuery.isPending ? <p className="text-sm text-muted-foreground">Loading saved items…</p> : null}
      {savedQuery.isError ? <p role="alert" className="text-sm text-destructive">{savedQuery.error.message}</p> : null}
      {!savedQuery.isPending && !savedQuery.isError && savedQuery.data?.actionItems.length === 0 ? <p className="text-sm text-muted-foreground">No approved action items yet.</p> : null}
      <div className="space-y-3">{savedQuery.data?.actionItems.map((item) => <SavedActionItem key={item.id} item={item} onChange={(fields) => update.mutate({ item, fields })} disabled={update.isPending} />)}</div>
      {update.isError ? <p role="alert" className="text-sm text-destructive">{update.error.message}. Refresh and try again if the item changed.</p> : null}
    </section>
  </CardContent></Card>;
}

function ActionItemEditor({ item, index, onChange, onRemove }: { item: SessionActionItemProposal; index: number; onChange: (patch: Partial<SessionActionItemProposal>) => void; onRemove: () => void }) {
  const titleId = `action-item-title-${index}`;
  const descriptionId = `action-item-description-${index}`;
  return <fieldset className="space-y-3 rounded-md border p-3">
    <legend className="px-1 text-sm font-medium">Action item {index + 1}</legend>
    <div className="space-y-1"><label htmlFor={titleId} className="text-sm">Title</label><Input id={titleId} maxLength={160} value={item.title} onChange={(event) => onChange({ title: event.target.value })} /></div>
    <div className="space-y-1"><label htmlFor={descriptionId} className="text-sm">Description (optional)</label><textarea id={descriptionId} maxLength={2000} value={item.description ?? ""} onChange={(event) => onChange({ description: event.target.value || null })} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">Owner<select value={item.owner} onChange={(event) => onChange({ owner: event.target.value as SessionActionItemProposal["owner"] })} className="h-10 w-full rounded-md border border-input bg-background px-3"><option value="unassigned">Unassigned</option><option value="founder">Founder</option><option value="mentor">Mentor</option><option value="shared">Shared</option></select></label>
      <label className="space-y-1 text-sm">Due date<input type="date" value={item.dueDate ?? ""} onChange={(event) => onChange({ dueDate: event.target.value || null })} className="h-10 w-full rounded-md border border-input bg-background px-3" /></label>
      <label className="space-y-1 text-sm">Priority<select value={item.priority} onChange={(event) => onChange({ priority: event.target.value as SessionActionItemProposal["priority"] })} className="h-10 w-full rounded-md border border-input bg-background px-3"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
    </div>
    {item.sourceText ? <p className="rounded bg-muted p-2 text-xs text-muted-foreground"><span className="font-medium">From notes: </span>{item.sourceText}</p> : null}
    <Button type="button" variant="outline" onClick={onRemove}><Trash2 className="mr-2 size-4" />Remove</Button>
  </fieldset>;
}

export function ActionItemFilters({ filters, onChange }: { filters: { status: string; owner: string; overdue: string }; onChange: (filters: { status: string; owner: string; overdue: string }) => void }) {
  return <div className="grid gap-2 sm:grid-cols-3" aria-label="Filter action items">
    <label className="space-y-1 text-xs text-muted-foreground">Status<select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="">All statuses</option>{["open", "in_progress", "done", "blocked"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></label>
    <label className="space-y-1 text-xs text-muted-foreground">Owner<select value={filters.owner} onChange={(event) => onChange({ ...filters, owner: event.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="">All owners</option>{["founder", "mentor", "shared", "unassigned"].map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
    <label className="space-y-1 text-xs text-muted-foreground">Due date<select value={filters.overdue} onChange={(event) => onChange({ ...filters, overdue: event.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="">Any due state</option><option value="true">Overdue</option><option value="false">Not overdue</option></select></label>
  </div>;
}

function displayDueDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString();
}

export function SavedActionItem({ item, onChange, disabled }: { item: SessionActionItem; onChange: (fields: Partial<Pick<SessionActionItem, "status" | "owner" | "dueDate" | "priority" | "title" | "description">>) => void; disabled: boolean }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [priority, setPriority] = useState(item.priority);
  const detailsDirty = title !== item.title || description !== (item.description ?? "") || priority !== item.priority;
  return <article className={`space-y-3 rounded-md border p-3 ${item.overdue ? "border-destructive/50 bg-destructive/5" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">{item.overdue ? <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">Overdue</span> : null}</div>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="space-y-1 text-xs text-muted-foreground sm:col-span-3">Action item title<input aria-label={`Title for ${item.title}`} maxLength={160} disabled={disabled} value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Status<select aria-label={`Status for ${item.title}`} disabled={disabled} value={item.status} onChange={(event) => onChange({ status: event.target.value as SessionActionItem["status"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{["open", "in_progress", "done", "blocked"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Owner<select aria-label={`Owner for ${item.title}`} disabled={disabled} value={item.owner} onChange={(event) => onChange({ owner: event.target.value as SessionActionItem["owner"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{["unassigned", "founder", "mentor", "shared"].map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Due date<input aria-label={`Due date for ${item.title}`} type="date" disabled={disabled} value={item.dueDate ?? ""} onChange={(event) => onChange({ dueDate: event.target.value || null })} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Priority<select aria-label={`Priority for ${item.title}`} disabled={disabled} value={priority} onChange={(event) => setPriority(event.target.value as SessionActionItem["priority"])} className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground">{["low", "medium", "high"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <label className="block space-y-1 text-xs text-muted-foreground">Description<textarea aria-label={`Description for ${item.title}`} maxLength={2000} disabled={disabled} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-16 w-full rounded-md border bg-background p-2 text-sm text-foreground" /></label>
    {detailsDirty ? <Button type="button" size="sm" disabled={disabled || !title.trim()} onClick={() => onChange({ title, description: description.trim() || null, priority })}>Save details</Button> : null}
    <p className="text-xs text-muted-foreground">Priority: {item.priority}{item.dueDate ? ` · Due ${displayDueDate(item.dueDate)}` : " · No due date"}</p>
  </article>;
}
