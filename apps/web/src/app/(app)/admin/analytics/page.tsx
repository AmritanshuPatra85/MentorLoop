"use client";

import { useQuery } from "@tanstack/react-query";
import { adminAnalyticsResponseSchema } from "@mentorloop/shared";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api-client";

function Metric({label,value}:{label:string;value:number}){return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p></CardContent></Card>;}
function Breakdown({title,rows}:{title:string;rows:{status:string;count:number}[]}){const entries=[...rows].sort((a,b)=>b.count-a.count||a.status.localeCompare(b.status));return <Card><CardHeader><h2 className="font-semibold">{title}</h2></CardHeader><CardContent>{entries.length?<dl className="space-y-3">{entries.map(item=><div key={item.status} className="flex justify-between gap-3 border-b pb-2 last:border-0"><dt className="capitalize text-muted-foreground">{item.status.replaceAll("_"," ")}</dt><dd className="font-medium">{item.count.toLocaleString()}</dd></div>)}</dl>:<p className="text-sm text-muted-foreground">No activity recorded yet.</p>}</CardContent></Card>;}
export default function AdminAnalyticsPage(){const query=useQuery({queryKey:["admin","analytics"],queryFn:()=>api.get("/admin-api/analytics",adminAnalyticsResponseSchema)});return <div className="mx-auto max-w-6xl space-y-6"><PageHeader title="Platform analytics" description="Current account, profile, mentoring, session and discovery counts."/>{query.isPending?<p role="status" className="text-sm text-muted-foreground">Loading analytics…</p>:query.isError?<Card><CardContent className="space-y-3 p-5"><p role="alert" className="text-sm text-destructive">{query.error.message}</p><Button variant="outline" onClick={()=>void query.refetch()}>Try again</Button></CardContent></Card>:<>
 <p className="text-xs text-muted-foreground">Updated {new Date(query.data.generatedAt).toLocaleString()}</p>
 <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Total users" value={query.data.users.total}/><Metric label="Verified emails" value={query.data.users.verified}/><Metric label="Startups" value={query.data.profiles.startups}/><Metric label="Mentor profiles" value={query.data.profiles.mentorProfiles}/><Metric label="Complete startups" value={query.data.profiles.completeStartups}/><Metric label="Complete mentor profiles" value={query.data.profiles.completeMentorProfiles}/></section>
 <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Breakdown title="Users by role" rows={query.data.users.byRole}/><Breakdown title="Users by status" rows={query.data.users.byStatus}/><Breakdown title="Connections" rows={query.data.connections}/><Breakdown title="Sessions" rows={query.data.sessions}/><Breakdown title="Match discovery events" rows={query.data.matchEvents}/></section>
 </>}</div>;}
