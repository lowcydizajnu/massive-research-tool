CREATE TABLE "module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_tags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"schema" jsonb NOT NULL,
	"default_config" jsonb NOT NULL,
	"changelog" text DEFAULT '' NOT NULL,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"deprecated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_version" ADD CONSTRAINT "module_version_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "module_source_key_unique" ON "module" USING btree ("source","key");--> statement-breakpoint
CREATE UNIQUE INDEX "module_version_unique" ON "module_version" USING btree ("module_id","version");