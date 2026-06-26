CREATE TABLE "cookie_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"pre_signup_id" text,
	"choice" text NOT NULL,
	"cookie_policy_version" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent_hash" text,
	"ip_country" text,
	CONSTRAINT "cookie_consent_choice" CHECK ("cookie_consent"."choice" IN ('all', 'necessary'))
);
--> statement-breakpoint
ALTER TABLE "cookie_consent" ADD CONSTRAINT "cookie_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cookie_consent_user" ON "cookie_consent" USING btree ("user_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_cookie_consent_presignup" ON "cookie_consent" USING btree ("pre_signup_id","recorded_at" DESC NULLS LAST);