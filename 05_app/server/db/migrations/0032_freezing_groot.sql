CREATE TABLE "study_presence" (
	"study_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_presence" ADD CONSTRAINT "study_presence_study_id_experiment_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_presence" ADD CONSTRAINT "study_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_presence_study_user_unique" ON "study_presence" USING btree ("study_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_study_presence_study" ON "study_presence" USING btree ("study_id","updated_at" DESC NULLS LAST);