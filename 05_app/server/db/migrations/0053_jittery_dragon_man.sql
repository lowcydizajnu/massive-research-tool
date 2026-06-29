ALTER TABLE "admin_view_as_log" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "support_access_enabled" boolean DEFAULT true NOT NULL;