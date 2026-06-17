CREATE TYPE "public"."quality_flag_kind" AS ENUM('fast_completion', 'straight_lining', 'duplicate_pid', 'manual', 'slow_completion', 'attention_check', 'spam_text');--> statement-breakpoint
CREATE TYPE "public"."quality_resolution" AS ENUM('approved', 'rejected', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."quality_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "quality_flag" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"response_id" text,
	"provider_submission_id" text,
	"external_pid" text,
	"flag_kind" "quality_flag_kind" NOT NULL,
	"severity" "quality_severity" NOT NULL,
	"auto_detected" boolean DEFAULT true NOT NULL,
	"detail" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution" "quality_resolution",
	"resolution_note" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quality_flag" ADD CONSTRAINT "quality_flag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_flag" ADD CONSTRAINT "quality_flag_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_flag" ADD CONSTRAINT "quality_flag_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_flag" ADD CONSTRAINT "quality_flag_provider_submission_id_provider_submission_id_fk" FOREIGN KEY ("provider_submission_id") REFERENCES "public"."provider_submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_flag" ADD CONSTRAINT "quality_flag_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quality_flag_response_kind_unique" ON "quality_flag" USING btree ("response_id","flag_kind") WHERE "quality_flag"."auto_detected" = true;--> statement-breakpoint
CREATE INDEX "idx_quality_workspace_resolved" ON "quality_flag" USING btree ("workspace_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_quality_experiment" ON "quality_flag" USING btree ("experiment_id");