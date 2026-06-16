CREATE TABLE "recruitment_provider_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "recruitment_provider" NOT NULL,
	"signing_secret" text NOT NULL,
	"subscriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruitment_provider_webhook" ADD CONSTRAINT "recruitment_provider_webhook_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_provider_webhook" ADD CONSTRAINT "recruitment_provider_webhook_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recruitment_webhook_ws_provider_unique" ON "recruitment_provider_webhook" USING btree ("workspace_id","provider");