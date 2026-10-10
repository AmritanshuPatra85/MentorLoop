CREATE TYPE "public"."connection_state" AS ENUM('requested', 'invited', 'accepted', 'declined', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"initiated_by" uuid NOT NULL,
	"state" "connection_state" NOT NULL,
	"intro_message" text,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_positive_window_ck" CHECK ("availability_exceptions"."starts_at" < "availability_exceptions"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_day_ck" CHECK ("availability_rules"."day_of_week" between 0 and 6),
	CONSTRAINT "availability_rules_positive_window_ck" CHECK ("availability_rules"."start_time" < "availability_rules"."end_time")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"time_range" "tstzrange" NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_nonempty_half_open_range_ck" CHECK (NOT isempty("sessions"."time_range") AND lower_inc("sessions"."time_range") AND NOT upper_inc("sessions"."time_range") AND NOT lower_inf("sessions"."time_range") AND NOT upper_inf("sessions"."time_range"))
);
--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD COLUMN "buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD COLUMN "minimum_notice_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_identity_pair_uidx" ON "connections" USING btree ("id","startup_id","mentor_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_connection_pair_fk" FOREIGN KEY ("connection_id","startup_id","mentor_id") REFERENCES "public"."connections"("id","startup_id","mentor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_pair_uidx" ON "connections" USING btree ("startup_id","mentor_id");--> statement-breakpoint
CREATE INDEX "connections_mentor_state_idx" ON "connections" USING btree ("mentor_id","state");--> statement-breakpoint
CREATE INDEX "connections_startup_state_idx" ON "connections" USING btree ("startup_id","state");--> statement-breakpoint
CREATE INDEX "connections_pair_declined_idx" ON "connections" USING btree ("startup_id","mentor_id","last_declined_at");--> statement-breakpoint
CREATE INDEX "availability_exceptions_mentor_start_idx" ON "availability_exceptions" USING btree ("mentor_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_rules_window_uidx" ON "availability_rules" USING btree ("mentor_id","day_of_week","start_time","end_time");--> statement-breakpoint
CREATE INDEX "availability_rules_mentor_day_idx" ON "availability_rules" USING btree ("mentor_id","day_of_week");--> statement-breakpoint
CREATE INDEX "sessions_connection_status_idx" ON "sessions" USING btree ("connection_id","status");
