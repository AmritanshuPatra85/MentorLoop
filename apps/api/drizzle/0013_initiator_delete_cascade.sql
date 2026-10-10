ALTER TABLE "connections" DROP CONSTRAINT "connections_initiated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;