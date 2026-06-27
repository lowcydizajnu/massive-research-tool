CREATE TABLE "release_announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_r2_key" text,
	"learn_more_url" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_seen_announcement_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_announcement" ADD CONSTRAINT "release_announcement_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_release_announcement_published" ON "release_announcement" USING btree ("published_at" DESC NULLS LAST);