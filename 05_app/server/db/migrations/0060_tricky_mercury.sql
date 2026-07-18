ALTER TABLE "experiment" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "funders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ror" text;