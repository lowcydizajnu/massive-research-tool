ALTER TABLE "member" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "activity_filter_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;