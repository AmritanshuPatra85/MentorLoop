import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/client";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { validate } from "../../middleware/validate";
import { enqueueProfileEmbedding } from "../embeddings/embedding.queue";
import { connectionTimelineResponseSchema, founderTimelineResponseSchema, stageProgressionRequestSchema, stageProgressionResponseSchema, startupMilestoneInputSchema, timelineMilestoneSchema } from "@mentorloop/shared";

const milestoneParams=z.object({milestoneId:z.string().uuid()});
type MilestoneRow={id:string;startup_id:string;title:string;description:string|null;milestone_date:string;status:"planned"|"achieved"|"cancelled";related_session_id:string|null;created_at:Date;updated_at:Date};
const mapMilestone=(m:MilestoneRow)=>timelineMilestoneSchema.parse({id:m.id,startupId:m.startup_id,title:m.title,description:m.description,milestoneDate:m.milestone_date,status:m.status,relatedSessionId:m.related_session_id,createdAt:m.created_at.toISOString(),updatedAt:m.updated_at.toISOString()});
async function ownedStartupId(founderId:string){const {rows}=await pool.query<{id:string}>("SELECT id FROM startups WHERE founder_id=$1",[founderId]);if(!rows[0])throw new NotFoundError("Startup not found");return rows[0].id;}
async function validateRelatedSession(startupId:string,sessionId:string|null|undefined){if(!sessionId)return;const {rowCount}=await pool.query("SELECT 1 FROM sessions WHERE id=$1 AND startup_id=$2",[sessionId,startupId]);if(!rowCount)throw new NotFoundError("Related session not found for this startup");}
async function listMilestones(startupId:string){const {rows}=await pool.query<MilestoneRow>("SELECT id,startup_id,title,description,milestone_date::text,status,related_session_id,created_at,updated_at FROM startup_milestones WHERE startup_id=$1 ORDER BY milestone_date,id",[startupId]);return rows.map(mapMilestone);}

export const founderTimelineRouter=Router();founderTimelineRouter.use(requireAuth,requireApproved,requireRole("founder"));
founderTimelineRouter.get("/",asyncHandler(async(req,res)=>{
 const startupId=await ownedStartupId(req.auth!.userId);
 const [{rows:startupRows},{rows:stageRows},milestones,{rows:sessions},{rows:changes}]=await Promise.all([
  pool.query<{id:string;name:string|null;stage_id:string|null}>("SELECT id,name,stage_id FROM startups WHERE id=$1",[startupId]),
  pool.query<{id:string;name:string;display_order:number}>("SELECT id,name,display_order FROM stages ORDER BY display_order,id"),
  listMilestones(startupId),
  pool.query<{id:string;status:string;starts_at:Date;ends_at:Date;mentor_name:string}>("SELECT s.id,s.status,lower(s.time_range) starts_at,upper(s.time_range) ends_at,u.full_name mentor_name FROM sessions s JOIN users u ON u.id=s.mentor_id WHERE s.startup_id=$1",[startupId]),
  pool.query<{id:string;created_at:Date;previous_name:string|null;new_name:string}>("SELECT e.id,e.created_at,old.name previous_name,new.name new_name FROM startup_stage_events e LEFT JOIN stages old ON old.id=e.previous_stage_id JOIN stages new ON new.id=e.new_stage_id WHERE e.startup_id=$1",[startupId]),
 ]);
 const startup=startupRows[0];if(!startup)throw new NotFoundError("Startup not found");
 const events=[
  ...milestones.map(m=>({id:m.id,type:"milestone" as const,title:m.title,description:m.description,occurredAt:m.milestoneDate,status:m.status,sessionId:m.relatedSessionId,href:m.relatedSessionId?`/sessions/${m.relatedSessionId}`:null})),
  ...sessions.map(s=>({id:s.id,type:"session" as const,title:`Mentoring session with ${s.mentor_name}`,description:null,occurredAt:new Date(s.starts_at).toISOString(),status:s.status as "scheduled"|"rescheduled"|"cancelled"|"completed"|"no_show",sessionId:s.id,href:`/sessions/${s.id}`})),
  ...changes.map(e=>({id:e.id,type:"stage" as const,title:`Stage advanced to ${e.new_name}`,description:e.previous_name?`Previous stage: ${e.previous_name}`:"Initial stage selected",occurredAt:e.created_at.toISOString(),status:"achieved" as const,sessionId:null,href:null})),
 ].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
 res.json(founderTimelineResponseSchema.parse({startup:{id:startup.id,name:startup.name,stageId:startup.stage_id},stageOptions:stageRows.map(s=>({id:s.id,name:s.name,displayOrder:s.display_order})),milestones,events}));
}));
founderTimelineRouter.get("/milestones",asyncHandler(async(req,res)=>res.json({milestones:await listMilestones(await ownedStartupId(req.auth!.userId))})));
founderTimelineRouter.post("/milestones",validate({body:startupMilestoneInputSchema}),asyncHandler(async(req,res)=>{
 const startupId=await ownedStartupId(req.auth!.userId);const body=startupMilestoneInputSchema.parse(req.body);await validateRelatedSession(startupId,body.relatedSessionId);
 const {rows}=await pool.query<MilestoneRow>("INSERT INTO startup_milestones(startup_id,title,description,milestone_date,status,related_session_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,startup_id,title,description,milestone_date::text,status,related_session_id,created_at,updated_at",[startupId,body.title,body.description?.trim()||null,body.milestoneDate,body.status,body.relatedSessionId??null,req.auth!.userId]);
 res.status(201).json(mapMilestone(rows[0]!));
}));
founderTimelineRouter.patch("/milestones/:milestoneId",validate({params:milestoneParams,body:startupMilestoneInputSchema}),asyncHandler(async(req,res)=>{
 const startupId=await ownedStartupId(req.auth!.userId);const id=String(req.params.milestoneId);const body=startupMilestoneInputSchema.parse(req.body);await validateRelatedSession(startupId,body.relatedSessionId);
 const {rows}=await pool.query<MilestoneRow>("UPDATE startup_milestones SET title=$3,description=$4,milestone_date=$5,status=$6,related_session_id=$7,updated_at=now() WHERE id=$1 AND startup_id=$2 RETURNING id,startup_id,title,description,milestone_date::text,status,related_session_id,created_at,updated_at",[id,startupId,body.title,body.description?.trim()||null,body.milestoneDate,body.status,body.relatedSessionId??null]);
 if(!rows[0])throw new NotFoundError("Milestone not found");res.json(mapMilestone(rows[0]));
}));
founderTimelineRouter.post("/stage",validate({body:stageProgressionRequestSchema}),asyncHandler(async(req,res)=>{
 const founderId=req.auth!.userId;const {stageId}=stageProgressionRequestSchema.parse(req.body);const client=await pool.connect();let startupId="";let previous:{id:string;name:string;display_order:number}|null=null;let next:{id:string;name:string;display_order:number}|undefined;let changed=false;let changedAt=new Date();
 try{await client.query("BEGIN");const current=await client.query<{id:string;stage_id:string|null;is_complete:boolean}>("SELECT id,stage_id,is_complete FROM startups WHERE founder_id=$1 FOR UPDATE",[founderId]);if(!current.rows[0])throw new NotFoundError("Startup not found");if(!current.rows[0].is_complete)throw new ForbiddenError("Complete founder onboarding before changing startup stage");startupId=current.rows[0].id;
  const options=await client.query<{id:string;name:string;display_order:number}>("SELECT id,name,display_order FROM stages WHERE id=$1 OR id=$2",[current.rows[0].stage_id,stageId]);next=options.rows.find(s=>s.id===stageId);previous=options.rows.find(s=>s.id===current.rows[0]!.stage_id)??null;if(!next)throw new NotFoundError("Stage not found");
  if(previous?.id===next.id){changed=false;}else{if(previous&&next.display_order<=previous.display_order)throw new ConflictError("Startup stage can only progress forward");await client.query("UPDATE startups SET stage_id=$2,updated_at=now() WHERE id=$1",[startupId,next.id]);await client.query("INSERT INTO startup_stage_events(startup_id,previous_stage_id,new_stage_id,actor_user_id) VALUES($1,$2,$3,$4)",[startupId,previous?.id??null,next.id,founderId]);changed=true;changedAt=new Date();}
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
 // Retry of an already-current stage also retries this queue operation without duplicating a stage event.
 await enqueueProfileEmbedding({profileType:"startup",profileId:startupId});
 res.json(stageProgressionResponseSchema.parse({previousStage:previous?{id:previous.id,name:previous.name,displayOrder:previous.display_order}:null,stage:{id:next!.id,name:next!.name,displayOrder:next!.display_order},changed,changedAt:changedAt.toISOString()}));
}));

export const connectionTimelineRouter=Router({mergeParams:true});connectionTimelineRouter.use(requireAuth,requireApproved,requireRole("founder","mentor"));
connectionTimelineRouter.get("/",asyncHandler(async(req,res)=>{
 const {rows:connections}=await pool.query<{id:string;startup_id:string;founder_id:string;mentor_id:string}>("SELECT c.id,c.startup_id,s.founder_id,c.mentor_id FROM connections c JOIN startups s ON s.id=c.startup_id WHERE c.id=$1",[req.params.connectionId]);const c=connections[0];if(!c||(c.founder_id!==req.auth!.userId&&c.mentor_id!==req.auth!.userId))throw new NotFoundError("Connection not found");
 const [{rows:sessions},{rows:milestones}]=await Promise.all([
  pool.query<{id:string;status:string;starts_at:Date;ends_at:Date;mentor_name:string}>("SELECT s.id,s.status,lower(s.time_range) starts_at,upper(s.time_range) ends_at,u.full_name mentor_name FROM sessions s JOIN users u ON u.id=s.mentor_id WHERE s.connection_id=$1",[c.id]),
  pool.query<MilestoneRow>("SELECT m.id,m.startup_id,m.title,m.description,m.milestone_date::text,m.status,m.related_session_id,m.created_at,m.updated_at FROM startup_milestones m JOIN sessions s ON s.id=m.related_session_id WHERE s.connection_id=$1 ORDER BY m.milestone_date,m.id",[c.id]),
 ]);
 const events=[...milestones.map(m=>({id:m.id,type:"milestone" as const,title:m.title,description:m.description,occurredAt:m.milestone_date,status:m.status,sessionId:m.related_session_id,href:m.related_session_id?`/sessions/${m.related_session_id}`:null})),...sessions.map(s=>({id:s.id,type:"session" as const,title:`Mentoring session with ${s.mentor_name}`,description:null,occurredAt:new Date(s.starts_at).toISOString(),status:s.status as "scheduled"|"rescheduled"|"cancelled"|"completed"|"no_show",sessionId:s.id,href:`/sessions/${s.id}`}))].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
 res.json(connectionTimelineResponseSchema.parse({events}));
}));
