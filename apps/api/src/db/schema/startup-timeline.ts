import { sql } from "drizzle-orm";
import { check,index,pgTable,text,timestamp,uniqueIndex,uuid,date } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { startups } from "./founder-onboarding";
import { stages } from "./taxonomy";
import { users } from "./users";

export const startupMilestones=pgTable("startup_milestones",{
 id:uuid("id").primaryKey().defaultRandom(),startupId:uuid("startup_id").notNull().references(()=>startups.id,{onDelete:"cascade"}),
 title:text("title").notNull(),description:text("description"),milestoneDate:date("milestone_date").notNull(),status:text("status").notNull().default("planned"),
 relatedSessionId:uuid("related_session_id").references(()=>sessions.id,{onDelete:"set null"}),createdBy:uuid("created_by").references(()=>users.id,{onDelete:"set null"}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},(t)=>[
 check("startup_milestones_title_ck",sql`length(btrim(${t.title})) BETWEEN 1 AND 160`),check("startup_milestones_description_ck",sql`${t.description} IS NULL OR length(${t.description}) <= 2000`),check("startup_milestones_status_ck",sql`${t.status} IN ('planned','achieved','cancelled')`),
 index("startup_milestones_startup_date_idx").on(t.startupId,t.milestoneDate,t.id),index("startup_milestones_session_idx").on(t.relatedSessionId),
]);

export const startupStageEvents=pgTable("startup_stage_events",{
 id:uuid("id").primaryKey().defaultRandom(),startupId:uuid("startup_id").notNull().references(()=>startups.id,{onDelete:"cascade"}),
 previousStageId:uuid("previous_stage_id").references(()=>stages.id,{onDelete:"set null"}),newStageId:uuid("new_stage_id").notNull().references(()=>stages.id,{onDelete:"restrict"}),
 actorUserId:uuid("actor_user_id").references(()=>users.id,{onDelete:"set null"}),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},(t)=>[index("startup_stage_events_startup_created_idx").on(t.startupId,t.createdAt,t.id),uniqueIndex("startup_stage_events_change_uidx").on(t.startupId,t.previousStageId,t.newStageId,t.createdAt)]);
