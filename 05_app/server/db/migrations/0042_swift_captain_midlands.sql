CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"route_name" text,
	"user_agent_hash" text,
	"ip_country" text,
	"screenshot_r2_key" text,
	"study_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_kind" CHECK ("feedback"."kind" IN ('bug', 'idea', 'question', 'other')),
	CONSTRAINT "feedback_status" CHECK ("feedback"."status" IN ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate'))
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_study_id_experiment_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."experiment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feedback_status_created" ON "feedback" USING btree ("status","created_at" DESC NULLS LAST);