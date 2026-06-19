CREATE TABLE "saved_record" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_record" ADD CONSTRAINT "saved_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_record" ADD CONSTRAINT "saved_record_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_record_user_study_unique" ON "saved_record" USING btree ("user_id","experiment_id");--> statement-breakpoint
CREATE INDEX "idx_saved_record_user" ON "saved_record" USING btree ("user_id");