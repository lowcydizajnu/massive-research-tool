CREATE TABLE "dataset_deposit" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"component_guid" text NOT NULL,
	"doi" text NOT NULL,
	"row_count" integer NOT NULL,
	"resource_link_id" text,
	"deposited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "osf_resource_link_study_type_uq";--> statement-breakpoint
ALTER TABLE "dataset_deposit" ADD CONSTRAINT "dataset_deposit_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_deposit" ADD CONSTRAINT "dataset_deposit_resource_link_id_osf_resource_link_id_fk" FOREIGN KEY ("resource_link_id") REFERENCES "public"."osf_resource_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_deposit_study_ordinal_uq" ON "dataset_deposit" USING btree ("experiment_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "osf_resource_link_study_type_uq" ON "osf_resource_link" USING btree ("experiment_id","resource_type") WHERE "osf_resource_link"."resource_type" <> 'data';--> statement-breakpoint
ALTER TABLE "study_record" DROP COLUMN "osf_dataset_component_guid";