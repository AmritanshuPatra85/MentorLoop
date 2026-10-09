ALTER TYPE "public"."user_status" ADD VALUE 'pending_approval' BEFORE 'suspended';--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'rejected' BEFORE 'suspended';