ALTER TABLE "user" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;