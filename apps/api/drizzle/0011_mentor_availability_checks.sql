ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_buffer_nonnegative_ck" CHECK ("mentor_profiles"."buffer_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_minimum_notice_nonnegative_ck" CHECK ("mentor_profiles"."minimum_notice_minutes" >= 0);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mentor_no_overlap_excl" EXCLUDE USING gist ("mentor_id" WITH =, "time_range" WITH &&) WHERE ("status" IN ('scheduled', 'rescheduled'));
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_startup_no_overlap_excl" EXCLUDE USING gist ("startup_id" WITH =, "time_range" WITH &&) WHERE ("status" IN ('scheduled', 'rescheduled'));
