CREATE TABLE "ai_provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"api_key" text NOT NULL,
	"key_hint" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_connection_provider" CHECK ("ai_provider_connection"."provider" IN ('anthropic', 'openai')),
	CONSTRAINT "ai_provider_connection_status" CHECK ("ai_provider_connection"."status" IN ('active', 'error'))
);
--> statement-breakpoint
ALTER TABLE "ai_provider_connection" ADD CONSTRAINT "ai_provider_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_connection" ADD CONSTRAINT "ai_provider_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_connection_ws_provider_unique" ON "ai_provider_connection" USING btree ("workspace_id","provider");