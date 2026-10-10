CREATE TABLE "google_calendar_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"from_status" "session_status",
	"to_status" "session_status",
	"old_starts_at" timestamp with time zone,
	"old_ends_at" timestamp with time zone,
	"new_starts_at" timestamp with time zone,
	"new_ends_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_events_type_ck" CHECK ("session_events"."event_type" IN ('created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'meeting_link_updated'))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "booking_actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "calendar_owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "google_calendar_accounts" ADD CONSTRAINT "google_calendar_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_events_session_created_idx" ON "session_events" USING btree ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_booking_actor_user_id_users_id_fk" FOREIGN KEY ("booking_actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_calendar_owner_user_id_users_id_fk" FOREIGN KEY ("calendar_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_participants_start_idx" ON "sessions" USING btree ("startup_id","mentor_id");