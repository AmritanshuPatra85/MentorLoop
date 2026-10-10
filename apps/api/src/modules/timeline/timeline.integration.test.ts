import express from "express";
import type { Server } from "node:http";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { db,pool } from "../../db/client";
import { connections,mentorProfiles,stages,startups,users } from "../../db/schema";
import { errorHandler } from "../../middleware/error-handler";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { signAccessToken } from "../auth/tokens";
import { closeEmbeddingQueue } from "../embeddings/embedding.queue";
import { founderTimelineRouter,connectionTimelineRouter } from "./timeline.routes";
import { inArray } from "drizzle-orm";

const unique=`${Date.now()}-${Math.random().toString(16).slice(2)}`;let server:Server|undefined;let base="";let founder="";let outsider="";let mentor="";let startupId="";let connectionId="";let sessionId="";let token="";let outsiderToken="";let mentorToken="";let milestoneId="";let laterStage="";let firstStage="";
beforeAll(async()=>{
 const u=await db.insert(users).values([{email:`timeline-founder-${unique}@example.test`,fullName:"Timeline Founder",role:"founder",status:"active",emailVerifiedAt:new Date()},{email:`timeline-outsider-${unique}@example.test`,fullName:"Timeline Outsider",role:"founder",status:"active",emailVerifiedAt:new Date()},{email:`timeline-mentor-${unique}@example.test`,fullName:"Timeline Mentor",role:"mentor",status:"active",emailVerifiedAt:new Date()}]).returning({id:users.id});founder=u[0]!.id;outsider=u[1]!.id;mentor=u[2]!.id;token=await signAccessToken({id:founder,role:"founder"});outsiderToken=await signAccessToken({id:outsider,role:"founder"});mentorToken=await signAccessToken({id:mentor,role:"mentor"});
 const stageRows=await db.select().from(stages).orderBy(stages.displayOrder);firstStage=stageRows[0]!.id;laterStage=stageRows[1]!.id;
 const [startup]=await db.insert(startups).values({founderId:founder,name:`Timeline startup ${unique}`,oneLiner:"Timeline fixture",description:"Timeline integration",stageId:firstStage,isComplete:true,timezone:"UTC",preferredSessionTimes:[]}).returning({id:startups.id});startupId=startup!.id;
 await db.insert(mentorProfiles).values({userId:mentor,currentRole:"Mentor",organization:"Test Org",bio:"Timeline fixture mentor",isComplete:true,maxMentees:2,sessionLengthMinutes:30,timezone:"UTC"});
 const [connection]=await db.insert(connections).values({startupId,mentorId:mentor,initiatedBy:founder,state:"accepted",respondedAt:new Date()}).returning({id:connections.id});connectionId=connection!.id;
 const sessionResult=await pool.query<{id:string}>("INSERT INTO sessions(connection_id,mentor_id,startup_id,time_range,status) VALUES($1,$2,$3,tstzrange(now()-interval '2 days',now()-interval '2 days'+interval '30 minutes','[)'),'completed') RETURNING id",[connectionId,mentor,startupId]);sessionId=sessionResult.rows[0]!.id;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{Object.assign(req,{log:{error:console.error,warn:console.warn,info:console.info}});next();});app.use("/timeline",founderTimelineRouter);const connectionTimeline=express.Router({mergeParams:true});connectionTimeline.use(requireAuth,requireApproved,requireRole("founder","mentor"),connectionTimelineRouter);app.use("/connections/:connectionId/timeline",connectionTimeline);app.use(errorHandler);
 await new Promise<void>((resolve,reject)=>{const listener=app.listen(0,"127.0.0.1",()=>{server=listener;const address=listener.address();if(!address||typeof address==="string")return reject(new Error("Could not bind timeline test server"));base=`http://127.0.0.1:${address.port}`;resolve();});listener.once("error",reject);});
});
afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));}if(founder||outsider||mentor)await db.delete(users).where(inArray(users.id,[founder,outsider,mentor].filter(Boolean)));await closeEmbeddingQueue().catch(()=>undefined);await pool.end();});
const request=(path:string,method="GET",body?:unknown,auth=token)=>fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${auth}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
describe("startup timeline HTTP integration",()=>{
 it("creates/edits founder milestones and returns a stable chronological journey",async()=>{
  const input={title:"First customer pilot",description:"Run a pilot cohort",milestoneDate:new Date(Date.now()-86_400_000).toISOString().slice(0,10),status:"planned",relatedSessionId:sessionId};
  const created=await request("/timeline/milestones","POST",input);expect(created.status).toBe(201);const item=await created.json() as {id:string;title:string};milestoneId=item.id;
  const edited=await request(`/timeline/milestones/${milestoneId}`,"PATCH",{...input,title:"Pilot completed",status:"achieved"});expect(edited.status).toBe(200);expect(await edited.json()).toMatchObject({title:"Pilot completed",status:"achieved"});
  const stage=await request("/timeline/stage","POST",{stageId:laterStage});expect(stage.status).toBe(200);expect(await stage.json()).toMatchObject({changed:true,previousStage:{id:firstStage},stage:{id:laterStage}});
  const duplicate=await request("/timeline/stage","POST",{stageId:laterStage});expect(duplicate.status).toBe(200);expect(await duplicate.json()).toMatchObject({changed:false});
  const rows=await pool.query<{count:string}>("SELECT count(*)::text count FROM startup_stage_events WHERE startup_id=$1",[startupId]);expect(rows.rows[0]!.count).toBe("1");
  const timeline=await (await request("/timeline")).json() as {events:Array<{type:string;occurredAt:string;sessionId:string|null}>};expect(timeline.events.map(e=>e.type)).toEqual(["session","milestone","stage"]);expect(timeline.events.find(e=>e.type==="milestone")?.sessionId).toBe(sessionId);
 });
 it("rejects another founder, malformed dates, unrelated sessions and backward stage changes",async()=>{
  expect((await request("/timeline")).status).toBe(200);
  expect((await request("/timeline", "GET",undefined,outsiderToken)).status).toBe(404);
  expect((await request("/timeline/milestones","POST",{title:"bad date",milestoneDate:"2026-02-31",status:"planned"})).status).toBe(400);
  expect((await request("/timeline/milestones","POST",{title:"wrong session",milestoneDate:"2026-01-01",status:"planned",relatedSessionId:"00000000-0000-4000-8000-000000000001"})).status).toBe(404);
  expect((await request("/timeline/stage","POST",{stageId:"00000000-0000-4000-8000-000000000001"})).status).toBe(404);
  expect((await request(`/timeline/milestones/${milestoneId}`,"PATCH",{title:"unauthorized edit",milestoneDate:"2026-01-01",status:"planned"},outsiderToken)).status).toBe(404);
  expect((await request("/timeline/stage","POST",{stageId:firstStage})).status).toBe(409);
  const unlinked=await request("/timeline/milestones","POST",{title:"Private startup milestone",milestoneDate:"2026-01-01",status:"planned"});expect(unlinked.status).toBe(201);
  const shared=await request(`/connections/${connectionId}/timeline`);expect(shared.status).toBe(200);const sharedEvents=(await shared.json() as {events:Array<{type:string;sessionId:string|null}>}).events;expect(sharedEvents).toMatchObject(expect.arrayContaining([expect.objectContaining({type:"session",sessionId}),expect.objectContaining({type:"milestone",sessionId})]));expect(sharedEvents).toHaveLength(2);
  expect((await request(`/connections/${connectionId}/timeline`,"GET",undefined,mentorToken)).status).toBe(200);
  expect((await request(`/connections/${connectionId}/timeline`,"GET",undefined,outsiderToken)).status).toBe(404);
 });
});
