CREATE TABLE "workspace_template" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_experiment_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"cover_image_r2_key" text,
	"share_scope" text DEFAULT 'private' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"starter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workspace_template_share_scope" CHECK ("workspace_template"."share_scope" IN ('private', 'workspace', 'public'))
);
--> statement-breakpoint
ALTER TABLE "workspace_template" ADD CONSTRAINT "workspace_template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_template" ADD CONSTRAINT "workspace_template_source_experiment_id_experiment_id_fk" FOREIGN KEY ("source_experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_template" ADD CONSTRAINT "workspace_template_source_version_id_experiment_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_template" ADD CONSTRAINT "workspace_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_template_ws" ON "workspace_template" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_template_scope" ON "workspace_template" USING btree ("share_scope");