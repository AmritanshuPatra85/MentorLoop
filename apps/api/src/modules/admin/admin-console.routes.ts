import { Router } from "express";
import { adminAnalyticsResponseSchema,adminUserListQuerySchema,adminUserListResponseSchema } from "@mentorloop/shared";
import { pool } from "../../db/client";
import { asyncHandler } from "../../lib/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import { requireAdmin } from "../../middleware/require-admin";
import { validate } from "../../middleware/validate";

export const adminConsoleRouter=Router();adminConsoleRouter.use(requireAuth,requireAdmin);
adminConsoleRouter.get("/users",validate({query:adminUserListQuerySchema}),asyncHandler(async(req,res)=>{
 const q=adminUserListQuerySchema.parse(req.query);const conditions:string[]=[];const values:unknown[]=[];
 if(q.role){values.push(q.role);conditions.push(`role=$${values.length}`);}if(q.status){values.push(q.status);conditions.push(`status=$${values.length}`);}if(q.search){values.push(`%${q.search}%`);conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`);}
 const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";
 const [{rows:countRows},{rows}]=await Promise.all([
  pool.query<{total:string}>(`SELECT count(*)::text total FROM users ${where}`,values),
  pool.query<{id:string;full_name:string;email:string;role:"founder"|"mentor"|"admin";status:"active"|"pending_approval"|"rejected"|"suspended";email_verified_at:Date|null;created_at:Date}>(`SELECT id,full_name,email,role,status,email_verified_at,created_at FROM users ${where} ORDER BY created_at DESC,id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.limit,q.offset]),
 ]);
 res.json(adminUserListResponseSchema.parse({users:rows.map(u=>({id:u.id,fullName:u.full_name,email:u.email,role:u.role,status:u.status,emailVerifiedAt:u.email_verified_at?.toISOString()??null,createdAt:u.created_at.toISOString()})),total:Number(countRows[0]?.total??0),limit:q.limit,offset:q.offset}));
}));

adminConsoleRouter.get("/analytics",asyncHandler(async(_req,res)=>{
 const [{rows:userRows},{rows:profileRows},{rows:connectionRows},{rows:sessionRows},{rows:eventRows}]=await Promise.all([
  pool.query<{total:string;verified:string}>("SELECT count(*)::text total,count(*) FILTER(WHERE email_verified_at IS NOT NULL)::text verified FROM users"),
  pool.query<{startups:string;complete_startups:string;mentor_profiles:string;complete_mentor_profiles:string}>("SELECT (SELECT count(*) FROM startups)::text startups,(SELECT count(*) FROM startups WHERE is_complete)::text complete_startups,(SELECT count(*) FROM mentor_profiles)::text mentor_profiles,(SELECT count(*) FROM mentor_profiles WHERE is_complete)::text complete_mentor_profiles"),
  pool.query<{status:string;count:string}>("SELECT state status,count(*)::text count FROM connections GROUP BY state"),
  pool.query<{status:string;count:string}>("SELECT status,count(*)::text count FROM sessions GROUP BY status"),
  pool.query<{status:string;count:string}>("SELECT event_type status,count(*)::text count FROM match_events GROUP BY event_type"),
 ]);
 const [byRole,byStatus]=await Promise.all([
  pool.query<{status:string;count:string}>("SELECT role status,count(*)::text count FROM users GROUP BY role"),
  pool.query<{status:string;count:string}>("SELECT status,count(*)::text count FROM users GROUP BY status"),
 ]);
 const counts=(rows:{status:string;count:string}[])=>rows.map(r=>({status:r.status,count:Number(r.count)}));const profiles=profileRows[0]!;
 res.json(adminAnalyticsResponseSchema.parse({generatedAt:new Date().toISOString(),users:{total:Number(userRows[0]?.total??0),verified:Number(userRows[0]?.verified??0),byRole:counts(byRole.rows),byStatus:counts(byStatus.rows)},profiles:{startups:Number(profiles.startups),completeStartups:Number(profiles.complete_startups),mentorProfiles:Number(profiles.mentor_profiles),completeMentorProfiles:Number(profiles.complete_mentor_profiles)},connections:counts(connectionRows),sessions:counts(sessionRows),matchEvents:counts(eventRows)}));
}));
