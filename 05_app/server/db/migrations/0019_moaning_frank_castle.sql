CREATE TABLE "panel" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_member" (
	"id" text PRIMARY KEY NOT NULL,
	"panel_id" text NOT NULL,
	"external_pid" text NOT NULL,
	"source_experiment_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel" ADD CONSTRAINT "panel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel" ADD CONSTRAINT "panel_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_member" ADD CONSTRAINT "panel_member_panel_id_panel_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_member" ADD CONSTRAINT "panel_member_source_experiment_id_experiment_id_fk" FOREIGN KEY ("source_experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_panel_workspace" ON "panel" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "panel_member_panel_pid_unique" ON "panel_member" USING btree ("panel_id","external_pid");