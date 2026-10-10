CREATE TABLE "session_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"rated_mentor_id" uuid,
	"rating" integer NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"comment" text,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_feedback_rating_ck" CHECK ("session_feedback"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "session_feedback_visibility_ck" CHECK ("session_feedback"."visibility" IN ('public_to_mentor','admin_private')),
	CONSTRAINT "session_feedback_tags_ck" CHECK ("session_feedback"."tags" <@ ARRAY['communication','preparedness','actionable_advice','domain_expertise','follow_through','empathy','other']::text[]),
	CONSTRAINT "session_feedback_comment_length_ck" CHECK ("session_feedback"."comment" IS NULL OR char_length("session_feedback"."comment") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_rated_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("rated_mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_feedback_session_author_uidx" ON "session_feedback" USING btree ("session_id","author_user_id");--> statement-breakpoint
CREATE INDEX "session_feedback_mentor_created_idx" ON "session_feedback" USING btree ("rated_mentor_id","created_at");--> statement-breakpoint
CREATE INDEX "session_feedback_visibility_idx" ON "session_feedback" USING btree ("visibility","created_at");