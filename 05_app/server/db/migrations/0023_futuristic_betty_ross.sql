ALTER TABLE "experiment" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "finished_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_finished_by_user_id_user_id_fk" FOREIGN KEY ("finished_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;