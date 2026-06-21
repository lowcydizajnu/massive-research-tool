CREATE TABLE "playground_card_vote" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playground_card" ADD COLUMN "poll_options" jsonb;--> statement-breakpoint
ALTER TABLE "playground_card_vote" ADD CONSTRAINT "playground_card_vote_card_id_playground_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."playground_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_card_vote" ADD CONSTRAINT "playground_card_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playground_card_vote_card_user_unique" ON "playground_card_vote" USING btree ("card_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_playground_card_vote_card" ON "playground_card_vote" USING btree ("card_id");