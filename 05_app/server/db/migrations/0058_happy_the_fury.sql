CREATE TYPE "public"."osf_resource_link_state" AS ENUM('pending', 'linked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."osf_resource_source" AS ENUM('minted', 'article_doi', 'external');--> statement-breakpoint
CREATE TYPE "public"."osf_resource_type" AS ENUM('data', 'analytic_code', 'materials', 'papers', 'supplements');--> statement-breakpoint
CREATE TABLE "osf_resource_link" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"resource_type" "osf_resource_type" NOT NULL,
	"pid" text NOT NULL,
	"description" text,
	"osf_resource_id" text,
	"finalized" boolean DEFAULT false NOT NULL,
	"source" "osf_resource_source" NOT NULL,
	"state" "osf_resource_link_state" DEFAULT 'pending' NOT NULL,
	"error_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_record" ADD COLUMN "osf_dataset_component_guid" text;--> statement-breakpoint
ALTER TABLE "osf_resource_link" ADD CONSTRAINT "osf_resource_link_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "osf_resource_link_study_type_uq" ON "osf_resource_link" USING btree ("experiment_id","resource_type");