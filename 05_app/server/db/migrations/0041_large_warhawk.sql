CREATE TABLE "legal_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"document_kind" text NOT NULL,
	"document_version" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_country" text,
	"user_agent_hash" text,
	CONSTRAINT "legal_acceptance_kind" CHECK ("legal_acceptance"."document_kind" IN ('terms', 'privacy', 'cookies'))
);
--> statement-breakpoint
ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_legal_acceptance_user_kind" ON "legal_acceptance" USING btree ("user_id","document_kind","document_version");