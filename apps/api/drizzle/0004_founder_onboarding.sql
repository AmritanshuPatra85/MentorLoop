CREATE TABLE "founder_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"founder_title" text,
	"linkedin_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "founder_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "startups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"founder_id" uuid NOT NULL,
	"name" text,
	"one_liner" text,
	"description" text,
	"stage_id" uuid,
	"help_needed" text,
	"goals" text,
	"timezone" text,
	"preferred_session_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "startups_founder_id_unique" UNIQUE("founder_id"),
	CONSTRAINT "startups_founder_id_users_id_fk" FOREIGN KEY ("founder_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "startups_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "startup_domains" (
	"startup_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "startup_domains_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "startups"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "startup_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "startup_domains_pair_uidx" ON "startup_domains" USING btree ("startup_id","domain_id");
