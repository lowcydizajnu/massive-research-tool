CREATE TYPE "public"."recruitment_status" AS ENUM('open', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."registry_push_attempt_status" AS ENUM('pending', 'pushed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."registry_push_status" AS ENUM('not_pushed', 'pending', 'pushed', 'failed', 'no_credentials', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."response_mode" AS ENUM('run', 'preview');--> statement-breakpoint
CREATE TYPE "public"."response_status" AS ENUM('started', 'completed', 'abandoned', 'disqualified');--> statement-breakpoint
CREATE TABLE "condition" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_version_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"allocation_weight" numeric DEFAULT '1.0' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_session" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_version_id" uuid NOT NULL,
	"status" "recruitment_status" DEFAULT 'open' NOT NULL,
	"target_n" integer,
	"current_n" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"oauth_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"push_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "registry_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"registry_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "registry_push" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_version_id" uuid NOT NULL,
	"registry_id" text NOT NULL,
	"status" "registry_push_attempt_status" DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"response_payload" jsonb,
	"error_text" text,
	"pushed_doi" text,
	"pushed_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "response" (
	"id" text PRIMARY KEY NOT NULL,
	"recruitment_session_id" text NOT NULL,
	"experiment_version_id" uuid NOT NULL,
	"condition_id" text NOT NULL,
	"external_pid" text,
	"mode" "response_mode" NOT NULL,
	"status" "response_status" DEFAULT 'started' NOT NULL,
	"current_question_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"client_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_item" (
	"id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"block_instance_id" text NOT NULL,
	"block_position" integer NOT NULL,
	"module_source" text NOT NULL,
	"module_key" text NOT NULL,
	"module_version" text NOT NULL,
	"answer" jsonb NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_version" ADD COLUMN "registry_push_status" "registry_push_status" DEFAULT 'not_pushed' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD COLUMN "registry_push_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD COLUMN "registry_push_last_error" text;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD COLUMN "external_registration_doi" text;--> statement-breakpoint
ALTER TABLE "condition" ADD CONSTRAINT "condition_experiment_version_id_experiment_version_id_fk" FOREIGN KEY ("experiment_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_session" ADD CONSTRAINT "recruitment_session_experiment_version_id_experiment_version_id_fk" FOREIGN KEY ("experiment_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_connection" ADD CONSTRAINT "registry_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_connection" ADD CONSTRAINT "registry_connection_registry_id_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_push" ADD CONSTRAINT "registry_push_experiment_version_id_experiment_version_id_fk" FOREIGN KEY ("experiment_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_push" ADD CONSTRAINT "registry_push_registry_id_registry_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_recruitment_session_id_recruitment_session_id_fk" FOREIGN KEY ("recruitment_session_id") REFERENCES "public"."recruitment_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_experiment_version_id_experiment_version_id_fk" FOREIGN KEY ("experiment_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_condition_id_condition_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."condition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_item" ADD CONSTRAINT "response_item_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "condition_version_slug_unique" ON "condition" USING btree ("experiment_version_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "registry_connection_user_registry_unique" ON "registry_connection" USING btree ("user_id","registry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "response_session_pid_unique" ON "response" USING btree ("recruitment_session_id","external_pid") WHERE "response"."external_pid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "response_item_unique" ON "response_item" USING btree ("response_id","block_instance_id");