CREATE TABLE "dashboard_layout" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"dashboard_kind" text NOT NULL,
	"workspace_id" uuid,
	"widgets" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_dashboard_default" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"widgets" jsonb NOT NULL,
	"set_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_dashboard_default" ADD CONSTRAINT "workspace_dashboard_default_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_dashboard_default" ADD CONSTRAINT "workspace_dashboard_default_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layout_user_kind_ws_unique" ON "dashboard_layout" USING btree ("user_id","dashboard_kind","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_dashboard_layout_user" ON "dashboard_layout" USING btree ("user_id");