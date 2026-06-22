CREATE TABLE "workspace_material" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"uploaded_by_user_id" uuid NOT NULL,
	"source_kind" text DEFAULT 'upload' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workspace_material_kind" CHECK ("workspace_material"."kind" IN ('image', 'audio', 'video', 'document')),
	CONSTRAINT "workspace_material_source_kind" CHECK ("workspace_material"."source_kind" IN ('upload', 'study-block-promote', 'playground-promote', 'tts-cache'))
);
--> statement-breakpoint
ALTER TABLE "workspace_material" ADD CONSTRAINT "workspace_material_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_material" ADD CONSTRAINT "workspace_material_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_material_ws" ON "workspace_material" USING btree ("workspace_id","kind","created_at");