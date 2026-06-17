CREATE TYPE "public"."payout_kind" AS ENUM('reward', 'bonus');--> statement-breakpoint
CREATE TABLE "payout_record" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"provider_submission_id" text,
	"kind" "payout_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_payout_budget" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"monthly_limit_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"alert_threshold_pct" integer DEFAULT 100 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_record" ADD CONSTRAINT "payout_record_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_record" ADD CONSTRAINT "payout_record_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_record" ADD CONSTRAINT "payout_record_provider_submission_id_provider_submission_id_fk" FOREIGN KEY ("provider_submission_id") REFERENCES "public"."provider_submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_record" ADD CONSTRAINT "payout_record_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_payout_budget" ADD CONSTRAINT "workspace_payout_budget_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_payout_budget" ADD CONSTRAINT "workspace_payout_budget_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_record_submission_reward_unique" ON "payout_record" USING btree ("provider_submission_id") WHERE "payout_record"."kind" = 'reward';--> statement-breakpoint
CREATE INDEX "idx_payout_workspace" ON "payout_record" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_payout_experiment" ON "payout_record" USING btree ("experiment_id");