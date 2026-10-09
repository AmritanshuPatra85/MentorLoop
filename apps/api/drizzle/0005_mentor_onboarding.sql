CREATE TABLE "mentor_domains" (
	"mentor_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_role" text,
	"organization" text,
	"bio" text,
	"experience_summary" text,
	"years_experience" integer,
	"help_topics" text,
	"max_mentees" integer,
	"session_length_minutes" integer,
	"timezone" text,
	"preferred_session_times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linkedin_url" text,
	"website_url" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_skills" (
	"mentor_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_stages" (
	"mentor_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentor_domains" ADD CONSTRAINT "mentor_domains_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_domains" ADD CONSTRAINT "mentor_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_skills" ADD CONSTRAINT "mentor_skills_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_skills" ADD CONSTRAINT "mentor_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_stages" ADD CONSTRAINT "mentor_stages_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_stages" ADD CONSTRAINT "mentor_stages_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_domains_pair_uidx" ON "mentor_domains" USING btree ("mentor_id","domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_skills_pair_uidx" ON "mentor_skills" USING btree ("mentor_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_stages_pair_uidx" ON "mentor_stages" USING btree ("mentor_id","stage_id");