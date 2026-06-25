ALTER TABLE "ai_provider_connection" DROP CONSTRAINT "ai_provider_connection_provider";--> statement-breakpoint
ALTER TABLE "ai_provider_connection" ADD COLUMN "secret_key" text;--> statement-breakpoint
ALTER TABLE "ai_provider_connection" ADD COLUMN "webhook_signing_key" text;--> statement-breakpoint
ALTER TABLE "ai_provider_connection" ADD CONSTRAINT "ai_provider_connection_provider" CHECK ("ai_provider_connection"."provider" IN ('anthropic', 'openai', 'hume'));