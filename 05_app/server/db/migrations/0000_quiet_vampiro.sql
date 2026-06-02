CREATE TYPE "public"."amendment_classification" AS ENUM('typo', 'methodological-correction', 'clarification', 'scope-change', 'other');--> statement-breakpoint
CREATE TYPE "public"."experiment_version_kind" AS ENUM('autosave', 'named', 'preregistered', 'published');--> statement-breakpoint
CREATE TYPE "public"."forkable_by" AS ENUM('public', 'link-only', 'private');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited');--> statement-breakpoint
CREATE TABLE "experiment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"current_version_id" uuid,
	"forkable_by" "forkable_by" DEFAULT 'private' NOT NULL,
	"fork_of_experiment_id" uuid,
	"fork_of_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "experiment_fork_consistency" CHECK (("fork_of_experiment_id" IS NULL) = ("fork_of_version_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "experiment_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"kind" "experiment_version_kind" NOT NULL,
	"name" text,
	"description" text,
	"definition_snapshot" jsonb NOT NULL,
	"module_version_locks" jsonb NOT NULL,
	"theme_id" uuid,
	"theme_snapshot" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_registration_url" text,
	"external_publication_url" text,
	"supersedes_version_id" uuid,
	"change_summary" text,
	"amendment_classification" "amendment_classification",
	CONSTRAINT "experiment_version_name_required" CHECK ("kind" = 'autosave' OR "name" IS NOT NULL),
	CONSTRAINT "experiment_version_amendment_consistency" CHECK (("supersedes_version_id" IS NULL AND "change_summary" IS NULL) OR ("supersedes_version_id" IS NOT NULL AND "change_summary" IS NOT NULL AND length(trim("change_summary")) > 0))
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"role" "member_role" NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"invited_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_status_user_consistency" CHECK (("status" = 'active' AND "user_id" IS NOT NULL) OR ("status" = 'invited' AND "invited_email" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_tenant_id_workspace_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_current_version_id_experiment_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_fork_of_experiment_id_experiment_id_fk" FOREIGN KEY ("fork_of_experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_fork_of_version_id_experiment_version_id_fk" FOREIGN KEY ("fork_of_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD CONSTRAINT "experiment_version_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD CONSTRAINT "experiment_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_version" ADD CONSTRAINT "experiment_version_supersedes_version_id_experiment_version_id_fk" FOREIGN KEY ("supersedes_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_version_number_unique" ON "experiment_version" USING btree ("experiment_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "member_workspace_user_unique" ON "member" USING btree ("workspace_id","user_id");