import express from "express";
import type { Server } from "node:http";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { db,pool } from "../../db/client";
import { connections,mentorProfiles,startups,users } from "../../db/schema";
import { errorHandler } from "../../middleware/error-handler";
import { requireApproved } from "../../middleware/require-approved";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { signAccessToken } from "../auth/tokens";
import { adminFeedbackRouter } from "../admin/feedback.routes";
import { sessionFeedbackRouter } from "./session-feedback.routes";

const unique=`${Date.now()}-${Math.random().toString(16).slice(2)}`; let server:Server|undefined; let base=""; let founder="";let mentor="";let outsider="";let admin="";let session="";let founderToken="";let mentorToken="";let outsiderToken="";let adminToken="";
beforeAll(async()=>{
 const rows=await db.insert(users).values([
  {email:`fb-founder-${unique}@example.test`,fullName:"Feedback Founder",role:"founder",status:"active",emailVerifiedAt:new Date()},
  {email:`fb-mentor-${unique}@example.test`,fullName:"Feedback Mentor",role:"mentor",status:"active",emailVerifiedAt:new Date()},
  {email:`fb-outsider-${unique}@example.test`,fullName:"Feedback Outsider",role:"founder",status:"active",emailVerifiedAt:new Date()},
  {email:`fb-admin-${unique}@example.test`,fullName:"Feedback Admin",role:"admin",status:"active",emailVerifiedAt:new Date()},
 ]).returning({id:users.id}); founder=rows[0]!.id;mentor=rows[1]!.id;outsider=rows[2]!.id;admin=rows[3]!.id;
 founderToken=await signAccessToken({id:founder,role:"founder"});mentorToken=await signAccessToken({id:mentor,role:"mentor"});outsiderToken=await signAccessToken({id:outsider,role:"founder"});adminToken=await signAccessToken({id:admin,role:"admin"});
 const [startup]=await db.insert(startups).values({founderId:founder,name:`Feedback Startup ${unique}`,oneLiner:"Feedback fixture",description:"Integration fixture",isComplete:true,timezone:"UTC",preferredSessionTimes:[]}).returning({id:startups.id});
 await db.insert(mentorProfiles).values({userId:mentor,currentRole:"Mentor",organization:"Test",bio:"Fixture",isComplete:true,maxMentees:2,sessionLengthMinutes:30,timezone:"UTC"});
 const [connection]=await db.insert(connections).values({startupId:startup!.id,mentorId:mentor,initiatedBy:founder,state:"accepted",respondedAt:new Date()}).returning({id:connections.id});
 const result=await pool.query<{id:string}>("INSERT INTO sessions(connection_id,mentor_id,startup_id,time_range,status) VALUES($1,$2,$3,tstzrange(now()-interval '2 days',now()-interval '2 days'+interval '30 minutes','[)'),'completed') RETURNING id",[connection!.id,mentor,startup!.id]);session=result.rows[0]!.id;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{Object.assign(req,{log:{error:console.error,warn:console.warn,info:console.info}});next();});
 const participants=express.Router({mergeParams:true});participants.use(requireAuth,requireApproved,requireRole("founder","mentor"),sessionFeedbackRouter);app.use("/sessions/:sessionId/feedback",participants);app.use("/admin/feedback",adminFeedbackRouter);app.use(errorHandler);
 await new Promise<void>((resolve,reject)=>{const listener=app.listen(0,"127.0.0.1",()=>{server=listener;const address=listener.address();if(!address||typeof address==="string")return reject(new Error("No feedback test server address"));base=`http://127.0.0.1:${address.port}`;resolve();});listener.once("error",reject);});
});
afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));}if(founder)await db.delete(users).where((await import("drizzle-orm")).inArray(users.id,[founder,mentor,outsider,admin]));await pool.end();});
const url=()=>`${base}/sessions/${session}/feedback`;const headers=(token:string)=>({Authorization:`Bearer ${token}`,"Content-Type":"application/json"});
describe("session feedback HTTP integration",()=>{
 it("accepts completed-session ratings, dedupes retries, and keeps private feedback admin-only",async()=>{
  const input={rating:5,tags:["communication","actionable_advice"],comment:"Clear and useful",visibility:"admin_private"};
  const first=await fetch(url(),{method:"POST",headers:headers(founderToken),body:JSON.stringify(input)});expect(first.status).toBe(201);expect(await first.json()).toMatchObject({submitted:true,created:true});
  const retry=await fetch(url(),{method:"POST",headers:headers(founderToken),body:JSON.stringify(input)});expect(retry.status).toBe(200);expect(await retry.json()).toMatchObject({created:false});
  const mentorRead=await fetch(url(),{headers:headers(mentorToken)});expect(await mentorRead.json()).toEqual({submitted:false});
  const outsiderRead=await fetch(url(),{headers:headers(outsiderToken)});expect(outsiderRead.status).toBe(404);
  const privateList=await fetch(`${base}/admin/feedback?visibility=admin_private`,{headers:headers(adminToken)});expect(privateList.status).toBe(200);expect(await privateList.json()).toMatchObject({items:[{comment:"Clear and useful",visibility:"admin_private",rating:5}]});
  const forbidden=await fetch(`${base}/admin/feedback`,{headers:headers(mentorToken)});expect(forbidden.status).toBe(403);
  const aggregates=await pool.query<{average:string;count:string}>("SELECT avg(f.rating)::text average,count(*)::text count FROM session_feedback f JOIN sessions s ON s.id=f.session_id AND s.status='completed' WHERE f.rated_mentor_id=$1",[mentor]);expect(aggregates.rows[0]).toMatchObject({average:"5.0000000000000000",count:"1"});
 });
 it("validates input and rejects non-participants and incomplete sessions",async()=>{
  expect((await fetch(url(),{method:"POST",headers:headers(outsiderToken),body:JSON.stringify({rating:5,tags:[],visibility:"admin_private"})})).status).toBe(404);
  expect((await fetch(url(),{method:"POST",headers:headers(mentorToken),body:JSON.stringify({rating:5,tags:[],visibility:"public_to_mentor"})})).status).toBe(403);
  expect((await fetch(url(),{method:"POST",headers:headers(mentorToken),body:JSON.stringify({rating:6,tags:[],visibility:"admin_private"})})).status).toBe(400);
  await pool.query("UPDATE sessions SET status='cancelled' WHERE id=$1",[session]);
  const ineligible=await fetch(url(),{method:"POST",headers:headers(mentorToken),body:JSON.stringify({rating:4,tags:[],visibility:"admin_private"})});expect(ineligible.status).toBe(409);
  await pool.query("UPDATE sessions SET status='completed' WHERE id=$1",[session]);
 });
});
