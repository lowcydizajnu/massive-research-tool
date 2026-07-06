CREATE TYPE "public"."osf_material_upload_kind" AS ENUM('stimulus', 'design-json', 'protocol-pdf');--> statement-breakpoint
CREATE TYPE "public"."osf_material_upload_status" AS ENUM('pending', 'uploaded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "osf_material_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"experiment_version_id" uuid,
	"node_id" text NOT NULL,
	"kind" "osf_material_upload_kind" NOT NULL,
	"artifact_key" text NOT NULL,
	"file_name" text NOT NULL,
	"osf_file_id" text,
	"osf_path" text,
	"osf_url" text,
	"status" "osf_material_upload_status" DEFAULT 'pending' NOT NULL,
	"size_bytes" integer,
	"error_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "osf_material_upload" ADD CONSTRAINT "osf_material_upload_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osf_material_upload" ADD CONSTRAINT "osf_material_upload_experiment_version_id_experiment_version_id_fk" FOREIGN KEY ("experiment_version_id") REFERENCES "public"."experiment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "osf_material_upload_study_artifact_uq" ON "osf_material_upload" USING btree ("experiment_id","artifact_key");