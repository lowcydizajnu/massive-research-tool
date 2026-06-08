ALTER TABLE "experiment" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "show_demo_content" boolean DEFAULT false NOT NULL;