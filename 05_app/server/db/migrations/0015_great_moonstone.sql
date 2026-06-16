CREATE TYPE "public"."recruitment_connection_status" AS ENUM('active', 'error');--> statement-breakpoint
CREATE TYPE "public"."recruitment_provider" AS ENUM('prolific');--> statement-breakpoint
CREATE TABLE "recruitment_provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "recruitment_provider" NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"provider_user_id" text,
	"status" "recruitment_connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruitment_provider_connection" ADD CONSTRAINT "recruitment_provider_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_provider_connection" ADD CONSTRAINT "recruitment_provider_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recruitment_conn_ws_user_provider_unique" ON "recruitment_provider_connection" USING btree ("workspace_id","user_id","provider");