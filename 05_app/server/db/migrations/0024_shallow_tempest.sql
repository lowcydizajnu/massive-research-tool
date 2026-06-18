CREATE TABLE "study_record" (
	"experiment_id" uuid PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'workspace' NOT NULL,
	"abstract" text,
	"article_url" text,
	"article_doi" text,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_record" ADD CONSTRAINT "study_record_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;