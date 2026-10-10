CREATE TABLE "session_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"founder_id" uuid NOT NULL,
	"current_status" text NOT NULL,
	"specific_questions" text NOT NULL,
	"desired_outcome" text NOT NULL,
	"content_hash" text NOT NULL,
	"digest" jsonb,
	"digest_status" text DEFAULT 'pending' NOT NULL,
	"digest_model" text,
	"digest_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_briefs_digest_status_ck" CHECK ("session_briefs"."digest_status" IN ('pending','ready','failed')),
	CONSTRAINT "session_briefs_current_status_ck" CHECK (length(btrim("session_briefs"."current_status")) BETWEEN 1 AND 2000),
	CONSTRAINT "session_briefs_specific_questions_ck" CHECK (length(btrim("session_briefs"."specific_questions")) BETWEEN 1 AND 2000),
	CONSTRAINT "session_briefs_desired_outcome_ck" CHECK (length(btrim("session_briefs"."desired_outcome")) BETWEEN 1 AND 2000),
	CONSTRAINT "session_briefs_content_hash_ck" CHECK ("session_briefs"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "session_briefs" ADD CONSTRAINT "session_briefs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_briefs" ADD CONSTRAINT "session_briefs_founder_id_users_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_briefs_session_uidx" ON "session_briefs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_briefs_founder_idx" ON "session_briefs" USING btree ("founder_id");