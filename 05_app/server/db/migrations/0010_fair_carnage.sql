CREATE TABLE "change_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"source_experiment_id" uuid NOT NULL,
	"target_experiment_id" uuid NOT NULL,
	"proposer_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"proposed_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decision_comment" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_proposal" ADD CONSTRAINT "change_proposal_source_experiment_id_experiment_id_fk" FOREIGN KEY ("source_experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposal" ADD CONSTRAINT "change_proposal_target_experiment_id_experiment_id_fk" FOREIGN KEY ("target_experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposal" ADD CONSTRAINT "change_proposal_proposer_user_id_user_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposal" ADD CONSTRAINT "change_proposal_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;