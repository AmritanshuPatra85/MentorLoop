"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackStatusSchema, feedbackSubmitResponseSchema, feedbackTagSchema } from "@mentorloop/shared";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const tags = feedbackTagSchema.options;
export function SessionFeedback({ sessionId, role }: { sessionId:string; role:"founder"|"mentor" }) {
  const cache=useQueryClient(); const [rating,setRating]=useState(0); const [selected,setSelected]=useState<string[]>([]); const [comment,setComment]=useState(""); const [visibility,setVisibility]=useState<"public_to_mentor"|"admin_private">("public_to_mentor");
  const status=useQuery({queryKey:["session-feedback",sessionId],queryFn:()=>api.get(`/sessions-api/${sessionId}/feedback`,feedbackStatusSchema)});
  const submit=useMutation({mutationFn:()=>api.post(`/sessions-api/${sessionId}/feedback`,feedbackSubmitResponseSchema,{rating,tags:selected,comment,visibility:role==="mentor"?"admin_private":visibility}),onSuccess:()=>void cache.invalidateQueries({queryKey:["session-feedback",sessionId]})});
  const toggle=(tag:string)=>setSelected((old)=>old.includes(tag)?old.filter((x)=>x!==tag):old.length<5?[...old,tag]:old);
  return <Card><CardContent className="space-y-4 p-5"><h3 className="font-semibold">Session feedback</h3>
    {status.isPending?<p className="text-sm text-muted-foreground">Checking feedback…</p>:null}
    {status.isError?<p role="alert" className="text-sm text-destructive">{status.error.message}</p>:null}
    {status.data?.submitted?<p role="status" className="text-sm">Thanks — your feedback has been recorded.</p>:null}
    {status.data && !status.data.submitted?<>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Rating (1–5)</legend><div className="flex gap-2">{[1,2,3,4,5].map((value)=><label key={value} className="flex items-center gap-1 text-sm"><input type="radio" name={`rating-${sessionId}`} checked={rating===value} onChange={()=>setRating(value)} />{value}</label>)}</div></fieldset>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Tags (up to five)</legend><div className="flex flex-wrap gap-3">{tags.map((tag)=><label key={tag} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={selected.includes(tag)} onChange={()=>toggle(tag)} />{tag.replaceAll("_"," ")}</label>)}</div></fieldset>
      <label className="block space-y-1 text-sm">Comment (optional)<textarea className="min-h-24 w-full rounded-md border bg-background p-2" maxLength={2000} value={comment} onChange={(e)=>setComment(e.target.value)} /><span className="text-xs text-muted-foreground">{comment.length}/2000</span></label>
      {role==="founder"?<label className="block space-y-1 text-sm">Who can read this comment?<select className="block h-10 rounded-md border bg-background px-2" value={visibility} onChange={(e)=>setVisibility(e.target.value as typeof visibility)}><option value="public_to_mentor">Mentor can read this</option><option value="admin_private">Private to administrators</option></select></label>:<p className="text-sm text-muted-foreground">Your feedback is private to administrators.</p>}
      {submit.isError?<p role="alert" className="text-sm text-destructive">{submit.error.message}</p>:null}
      <Button disabled={rating===0||submit.isPending} onClick={()=>submit.mutate()}>{submit.isPending?"Submitting…":"Submit feedback"}</Button>
    </>:null}
  </CardContent></Card>;
}
