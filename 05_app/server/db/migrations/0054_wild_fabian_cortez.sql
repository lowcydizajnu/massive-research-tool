CREATE TABLE "study_edit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_edit_event" ADD CONSTRAINT "study_edit_event_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_edit_event" ADD CONSTRAINT "study_edit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_study_edit_event_study" ON "study_edit_event" USING btree ("experiment_id","created_at" DESC NULLS LAST);