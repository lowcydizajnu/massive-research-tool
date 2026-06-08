ALTER TABLE "user" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "affiliation" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "orcid" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "research_areas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "scholar_url" text;