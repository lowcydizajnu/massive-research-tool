CREATE TABLE "playground_card" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"body" text,
	"url" text,
	"media_key" text,
	"ref_doi" text,
	"assignee_user_id" uuid,
	"done" boolean DEFAULT false NOT NULL,
	"position" numeric DEFAULT '0' NOT NULL,
	"converted_study_id" uuid,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playground_card_kind" CHECK ("playground_card"."kind" IN ('link', 'note', 'image', 'file', 'reference', 'todo', 'poll'))
);
--> statement-breakpoint
ALTER TABLE "comment" DROP CONSTRAINT "comment_target_type";--> statement-breakpoint
ALTER TABLE "comment" ALTER COLUMN "experiment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "playground_card" ADD CONSTRAINT "playground_card_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_card" ADD CONSTRAINT "playground_card_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_card" ADD CONSTRAINT "playground_card_converted_study_id_experiment_id_fk" FOREIGN KEY ("converted_study_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_card" ADD CONSTRAINT "playground_card_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_playground_card_board" ON "playground_card" USING btree ("workspace_id","position");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_target_type" CHECK ("comment"."target_type" IN ('study', 'block_instance', 'playground_card'));