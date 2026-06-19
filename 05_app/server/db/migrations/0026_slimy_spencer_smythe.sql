ALTER TABLE "study_record" ADD COLUMN "data_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_record" ADD COLUMN "data_table" jsonb;