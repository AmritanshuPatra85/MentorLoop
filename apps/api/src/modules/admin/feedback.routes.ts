import { Router } from "express";
import { adminFeedbackListSchema } from "@mentorloop/shared";
import { z } from "zod";
import { pool } from "../../db/client";
import { asyncHandler } from "../../lib/async-handler";
import { requireAuth } from "../../middleware/require-auth";
import { requireAdmin } from "../../middleware/require-admin";

export const adminFeedbackRouter=Router(); adminFeedbackRouter.use(requireAuth,requireAdmin);
adminFeedbackRouter.get("/",asyncHandler(async(req,res)=>{
  const query=z.object({visibility:z.enum(["public_to_mentor","admin_private"]).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
  const {rows}=await pool.query<{id:string;session_id:string;connection_id:string;author_name:string;author_role:"founder"|"mentor";mentor_name:string;rating:number;tags:string[];comment:string|null;visibility:"public_to_mentor"|"admin_private";created_at:Date}>(`SELECT f.id,f.session_id,f.connection_id,author.full_name author_name,author.role author_role,mentor.full_name mentor_name,f.rating,f.tags,f.comment,f.visibility,f.created_at
    FROM session_feedback f JOIN users author ON author.id=f.author_user_id JOIN users mentor ON mentor.id=COALESCE(f.rated_mentor_id,(SELECT s.mentor_id FROM sessions s WHERE s.id=f.session_id))
    WHERE ($1::text IS NULL OR f.visibility=$1) ORDER BY f.created_at DESC,f.id LIMIT $2 OFFSET $3`,[query.visibility??null,query.limit,query.offset]);
  res.json(adminFeedbackListSchema.parse({items:rows.map((r)=>({id:r.id,sessionId:r.session_id,connectionId:r.connection_id,authorName:r.author_name,authorRole:r.author_role,mentorName:r.mentor_name,rating:r.rating,tags:r.tags,comment:r.comment,visibility:r.visibility,createdAt:r.created_at.toISOString()})),limit:query.limit,offset:query.offset}));
}));
