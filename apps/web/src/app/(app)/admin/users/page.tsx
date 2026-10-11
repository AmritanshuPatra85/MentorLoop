"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminUserListResponseSchema } from "@mentorloop/shared";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card,CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

const PAGE_SIZE=25;
export default function AdminUsersPage(){
 const [search,setSearch]=useState("");const [role,setRole]=useState("");const [status,setStatus]=useState("");const [offset,setOffset]=useState(0);
 const params=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(offset)});if(search.trim())params.set("search",search.trim());if(role)params.set("role",role);if(status)params.set("status",status);
 const query=useQuery({queryKey:["admin","users",search,role,status,offset],queryFn:()=>api.get(`/admin-api/users?${params.toString()}`,adminUserListResponseSchema)});
 return <div className="mx-auto max-w-6xl space-y-6"><PageHeader title="Users" description="Browse platform accounts and their verification and approval status."/>
  <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row"><Input aria-label="Search users" placeholder="Search name or email" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/><select aria-label="Filter by role" className="h-10 rounded-md border bg-background px-3" value={role} onChange={e=>{setRole(e.target.value);setOffset(0);}}><option value="">All roles</option><option value="founder">Founder</option><option value="mentor">Mentor</option><option value="admin">Admin</option></select><select aria-label="Filter by status" className="h-10 rounded-md border bg-background px-3" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">All statuses</option><option value="active">Active</option><option value="pending_approval">Pending approval</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></CardContent></Card>
  {query.isPending?<p role="status" className="text-sm text-muted-foreground">Loading users…</p>:query.isError?<Card><CardContent className="space-y-3 p-5"><p role="alert" className="text-sm text-destructive">{query.error.message}</p><Button variant="outline" onClick={()=>void query.refetch()}>Try again</Button></CardContent></Card>:<>
   <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-secondary/60"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Email verified</th><th className="p-3">Joined</th></tr></thead><tbody>{query.data.users.map(user=><tr key={user.id} className="border-t"><td className="p-3"><p className="font-medium">{user.fullName}</p><p className="text-muted-foreground">{user.email}</p></td><td className="p-3 capitalize">{user.role}</td><td className="p-3 capitalize">{user.status.replaceAll("_"," ")}</td><td className="p-3">{user.emailVerifiedAt?"Verified":"Not verified"}</td><td className="p-3">{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table>{query.data.users.length===0?<p className="p-6 text-center text-sm text-muted-foreground">No users match these filters.</p>:null}</div>
   <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{query.data.total===0?0:offset+1}–{Math.min(offset+PAGE_SIZE,query.data.total)} of {query.data.total}</p><div className="flex gap-2"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))}>Previous</Button><Button variant="outline" disabled={offset+PAGE_SIZE>=query.data.total} onClick={()=>setOffset(offset+PAGE_SIZE)}>Next</Button></div></div>
  </>}</div>;
}
