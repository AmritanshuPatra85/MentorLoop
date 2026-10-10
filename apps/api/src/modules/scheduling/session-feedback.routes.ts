import { Router } from "express";
import { feedbackStatusSchema, feedbackSubmissionSchema, feedbackSubmitResponseSchema } from "@mentorloop/shared";
import { pool } from "../../db/client";
import { asyncHandler } from "../../lib/async-handler";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { validate } from "../../middleware/validate";

export const sessionFeedbackRouter = Router({ mergeParams: true });
sessionFeedbackRouter.get("/", asyncHandler(async (req,res) => {
  const { rows } = await pool.query<{ founder_id:string; mentor_id:string; submitted:boolean }>(
    `SELECT startup.founder_id,session.mentor_id,EXISTS(SELECT 1 FROM session_feedback f WHERE f.session_id=session.id AND f.author_user_id=$2) submitted
     FROM sessions session JOIN startups startup ON startup.id=session.startup_id WHERE session.id=$1`, [req.params.sessionId,req.auth!.userId]);
  const row=rows[0]; if(!row) throw new NotFoundError("Session not found");
  if(row.founder_id!==req.auth!.userId && row.mentor_id!==req.auth!.userId) throw new NotFoundError("Session not found");
  res.json(feedbackStatusSchema.parse({submitted:row.submitted}));
}));

sessionFeedbackRouter.post("/", validate({body:feedbackSubmissionSchema}), asyncHandler(async(req,res)=>{
  const actorId=req.auth!.userId; const input=feedbackSubmissionSchema.parse(req.body);
  const client=await pool.connect(); let created=false; let mentorId="";
  try {
    await client.query("BEGIN");
    const {rows}=await client.query<{id:string;connection_id:string;mentor_id:string;founder_id:string;status:string}>(
      `SELECT s.id,s.connection_id,s.mentor_id,startup.founder_id,s.status FROM sessions s JOIN startups startup ON startup.id=s.startup_id WHERE s.id=$1 FOR UPDATE OF s`,[req.params.sessionId]);
    const session=rows[0]; if(!session) throw new NotFoundError("Session not found");
    const isFounder=session.founder_id===actorId; const isMentor=session.mentor_id===actorId;
    if(!isFounder&&!isMentor) throw new NotFoundError("Session not found");
    if(session.status!=="completed") throw new ConflictError("Feedback is available only after a completed session");
    if(isMentor&&input.visibility!=="admin_private") throw new ForbiddenError("Mentor feedback is private to administrators");
    mentorId=session.mentor_id;
    const inserted=await client.query(
      `INSERT INTO session_feedback(session_id,connection_id,author_user_id,rated_mentor_id,rating,tags,comment,visibility)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(session_id,author_user_id) DO NOTHING RETURNING id`,
      [session.id,session.connection_id,actorId,isFounder?session.mentor_id:null,input.rating,input.tags,input.comment||null,input.visibility]);
    created=inserted.rowCount===1;
    if(created && req.auth!.role==="founder") {
      // Rankings are computed per request; remove hash-keyed explanations that include the old signal.
      await client.query(`DELETE FROM match_explanations WHERE mentor_content_hash=(SELECT content_hash FROM profile_embeddings WHERE mentor_id=$1 LIMIT 1)`,[mentorId]);
    }
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; } finally { client.release(); }
  res.status(created?201:200).json(feedbackSubmitResponseSchema.parse({submitted:true,created}));
}));
