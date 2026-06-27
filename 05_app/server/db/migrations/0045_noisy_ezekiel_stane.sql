CREATE TABLE "admin_view_as_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_view_as_action" CHECK ("admin_view_as_log"."action" IN ('enter', 'exit'))
);
--> statement-breakpoint
ALTER TABLE "admin_view_as_log" ADD CONSTRAINT "admin_view_as_log_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_view_as_log" ADD CONSTRAINT "admin_view_as_log_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_view_as_admin" ON "admin_view_as_log" USING btree ("admin_user_id","at" DESC NULLS LAST);