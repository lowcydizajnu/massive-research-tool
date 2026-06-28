CREATE TABLE "email_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"digest_enabled" boolean DEFAULT false NOT NULL,
	"digest_day_of_week" integer DEFAULT 1 NOT NULL,
	"digest_hour_utc" integer DEFAULT 9 NOT NULL,
	"digest_subject" text DEFAULT 'Your weekly research digest' NOT NULL,
	"digest_intro_md" text DEFAULT 'Here''s what happened across your workspaces this week.' NOT NULL,
	"nudge_enabled" boolean DEFAULT false NOT NULL,
	"nudge_dormant_days" integer DEFAULT 14 NOT NULL,
	"nudge_window_days" integer DEFAULT 46 NOT NULL,
	"nudge_cooldown_days" integer DEFAULT 60 NOT NULL,
	"nudge_subject" text DEFAULT 'Pick up where you left off' NOT NULL,
	"nudge_intro_md" text DEFAULT 'It''s been a little while — your studies are right where you left them.' NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_singleton" CHECK ("email_settings"."id" = 'singleton')
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_digest_opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nudge_last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;