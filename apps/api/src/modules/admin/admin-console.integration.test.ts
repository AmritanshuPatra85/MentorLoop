import express from "express";
import type { Server } from "node:http";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { inArray } from "drizzle-orm";
import { db,pool } from "../../db/client";
import { users } from "../../db/schema";
import { errorHandler } from "../../middleware/error-handler";
import { signAccessToken } from "../auth/tokens";
import { adminConsoleRouter } from "./admin-console.routes";

const unique=`${Date.now()}-${Math.random().toString(16).slice(2)}`;let server:Server|undefined;let base="";let admin="";let founder="";let adminToken="";let founderToken="";
beforeAll(async()=>{const rows=await db.insert(users).values([{email:`console-admin-${unique}@example.test`,fullName:"Console Admin",role:"admin",status:"active",emailVerifiedAt:new Date()},{email:`console-founder-${unique}@example.test`,fullName:"Console Founder",role:"founder",status:"active",emailVerifiedAt:new Date()}]).returning({id:users.id});admin=rows[0]!.id;founder=rows[1]!.id;adminToken=await signAccessToken({id:admin,role:"admin"});founderToken=await signAccessToken({id:founder,role:"founder"});const app=express();app.use((req,_res,next)=>{Object.assign(req,{log:{error:console.error,warn:console.warn,info:console.info}});next();});app.use("/admin",adminConsoleRouter);app.use(errorHandler);await new Promise<void>((resolve,reject)=>{const listener=app.listen(0,"127.0.0.1",()=>{server=listener;const address=listener.address();if(!address||typeof address==="string")return reject(new Error("No admin test server address"));base=`http://127.0.0.1:${address.port}`;resolve();});listener.once("error",reject);});});
afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));}if(admin||founder)await db.delete(users).where(inArray(users.id,[admin,founder].filter(Boolean)));await pool.end();});
describe("admin user and analytics API",()=>{
 it("restricts user browsing to admins and supports search, filters and pagination",async()=>{const url=`${base}/admin/users?search=${encodeURIComponent(`Console Founder`)}&role=founder&limit=10&offset=0`;const response=await fetch(url,{headers:{Authorization:`Bearer ${adminToken}`}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({total:1,users:[{id:founder,email:`console-founder-${unique}@example.test`,role:"founder"}]});expect((await fetch(`${base}/admin/users`,{headers:{Authorization:`Bearer ${founderToken}`} })).status).toBe(403);});
 it("returns platform counts only to admins",async()=>{const response=await fetch(`${base}/admin/analytics`,{headers:{Authorization:`Bearer ${adminToken}`}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({users:{total:expect.any(Number),byRole:expect.arrayContaining([expect.objectContaining({status:"admin"}),expect.objectContaining({status:"founder"})])},profiles:{startups:expect.any(Number)},connections:expect.any(Array),sessions:expect.any(Array),matchEvents:expect.any(Array)});expect((await fetch(`${base}/admin/analytics`,{headers:{Authorization:`Bearer ${founderToken}`} })).status).toBe(403);});
});
