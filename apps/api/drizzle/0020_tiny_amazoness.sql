CREATE TABLE "session_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"created_by" uuid,
	"submission_id" uuid NOT NULL,
	"submission_index" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner" text NOT NULL,
	"due_date" date,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_action_items_title_ck" CHECK (length(btrim("session_action_items"."title")) BETWEEN 1 AND 160),
	CONSTRAINT "session_action_items_description_ck" CHECK ("session_action_items"."description" IS NULL OR length("session_action_items"."description") <= 2000),
	CONSTRAINT "session_action_items_owner_ck" CHECK ("session_action_items"."owner" IN ('founder','mentor','shared','unassigned')),
	CONSTRAINT "session_action_items_priority_ck" CHECK ("session_action_items"."priority" IN ('low','medium','high')),
	CONSTRAINT "session_action_items_status_ck" CHECK ("session_action_items"."status" = 'open'),
	CONSTRAINT "session_action_items_submission_index_ck" CHECK ("session_action_items"."submission_index" BETWEEN 0 AND 19)
);
--> statement-breakpoint
ALTER TABLE "session_action_items" ADD CONSTRAINT "session_action_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_action_items" ADD CONSTRAINT "session_action_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_action_items_submission_uidx" ON "session_action_items" USING btree ("created_by","submission_id","submission_index");--> statement-breakpoint
CREATE INDEX "session_action_items_session_created_idx" ON "session_action_items" USING btree ("session_id","created_at");