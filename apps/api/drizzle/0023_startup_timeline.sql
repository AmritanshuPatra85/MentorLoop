CREATE TABLE "startup_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"milestone_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"related_session_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "startup_milestones_title_ck" CHECK (length(btrim("startup_milestones"."title")) BETWEEN 1 AND 160),
	CONSTRAINT "startup_milestones_description_ck" CHECK ("startup_milestones"."description" IS NULL OR length("startup_milestones"."description") <= 2000),
	CONSTRAINT "startup_milestones_status_ck" CHECK ("startup_milestones"."status" IN ('planned','achieved','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "startup_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"previous_stage_id" uuid,
	"new_stage_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startup_milestones" ADD CONSTRAINT "startup_milestones_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_milestones" ADD CONSTRAINT "startup_milestones_related_session_id_sessions_id_fk" FOREIGN KEY ("related_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_milestones" ADD CONSTRAINT "startup_milestones_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_stage_events" ADD CONSTRAINT "startup_stage_events_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_stage_events" ADD CONSTRAINT "startup_stage_events_previous_stage_id_stages_id_fk" FOREIGN KEY ("previous_stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_stage_events" ADD CONSTRAINT "startup_stage_events_new_stage_id_stages_id_fk" FOREIGN KEY ("new_stage_id") REFERENCES "public"."stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_stage_events" ADD CONSTRAINT "startup_stage_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "startup_milestones_startup_date_idx" ON "startup_milestones" USING btree ("startup_id","milestone_date","id");--> statement-breakpoint
CREATE INDEX "startup_milestones_session_idx" ON "startup_milestones" USING btree ("related_session_id");--> statement-breakpoint
CREATE INDEX "startup_stage_events_startup_created_idx" ON "startup_stage_events" USING btree ("startup_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "startup_stage_events_change_uidx" ON "startup_stage_events" USING btree ("startup_id","previous_stage_id","new_stage_id","created_at");