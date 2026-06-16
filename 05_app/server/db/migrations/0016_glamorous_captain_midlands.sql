CREATE TABLE "provider_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"recruitment_session_id" text,
	"provider" "recruitment_provider" NOT NULL,
	"provider_study_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"external_pid" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"reward_amount_cents" integer,
	"currency" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_submission" ADD CONSTRAINT "provider_submission_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_submission" ADD CONSTRAINT "provider_submission_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_submission" ADD CONSTRAINT "provider_submission_recruitment_session_id_recruitment_session_id_fk" FOREIGN KEY ("recruitment_session_id") REFERENCES "public"."recruitment_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_submission" ADD CONSTRAINT "provider_submission_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_submission_provider_submission_unique" ON "provider_submission" USING btree ("provider","submission_id");--> statement-breakpoint
CREATE INDEX "idx_provider_submission_experiment" ON "provider_submission" USING btree ("experiment_id","status");--> statement-breakpoint
CREATE INDEX "idx_provider_submission_workspace" ON "provider_submission" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "idx_provider_submission_pid" ON "provider_submission" USING btree ("external_pid");