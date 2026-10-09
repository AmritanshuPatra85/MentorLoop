CREATE TABLE "profile_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid,
	"mentor_id" uuid,
	"embedding" vector(384) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_embeddings_exactly_one_profile_ck" CHECK (num_nonnulls("profile_embeddings"."startup_id", "profile_embeddings"."mentor_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_mentor_id_mentor_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_embeddings_startup_uidx" ON "profile_embeddings" USING btree ("startup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_embeddings_mentor_uidx" ON "profile_embeddings" USING btree ("mentor_id");--> statement-breakpoint
CREATE INDEX "profile_embeddings_embedding_hnsw_idx" ON "profile_embeddings" USING hnsw ("embedding" vector_cosine_ops);