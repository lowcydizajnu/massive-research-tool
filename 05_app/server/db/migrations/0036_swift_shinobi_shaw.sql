CREATE TABLE "ai_invocation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"study_id" uuid,
	"response_id" text,
	"block_instance_id" text,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"modality" text NOT NULL,
	"sensitivity" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"cost_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"result_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_invocation_modality" CHECK ("ai_invocation"."modality" IN ('text', 'voice', 'tts', 'conversation')),
	CONSTRAINT "ai_invocation_sensitivity" CHECK ("ai_invocation"."sensitivity" IN ('researcher_content', 'participant_data', 'pii')),
	CONSTRAINT "ai_invocation_status" CHECK ("ai_invocation"."status" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "ai_invocation_payload" (
	"invocation_id" text PRIMARY KEY NOT NULL,
	"r2_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_ai_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"allow_pii_to_external_ai" boolean DEFAULT false NOT NULL,
	"monthly_budget_usd_cap" numeric(10, 2),
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_invocation" ADD CONSTRAINT "ai_invocation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_invocation" ADD CONSTRAINT "ai_invocation_study_id_experiment_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."experiment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_invocation" ADD CONSTRAINT "ai_invocation_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_invocation_payload" ADD CONSTRAINT "ai_invocation_payload_invocation_id_ai_invocation_id_fk" FOREIGN KEY ("invocation_id") REFERENCES "public"."ai_invocation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_invocation_workspace_created" ON "ai_invocation" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_invocation_response" ON "ai_invocation" USING btree ("response_id");