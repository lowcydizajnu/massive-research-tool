CREATE TABLE "activity_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" uuid,
	"workspace_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"related_tag_slugs" text[],
	"related_author_user_id" uuid,
	"related_framework_id" text,
	"related_study_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"experiment_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "comment_target_type" CHECK ("comment"."target_type" IN ('study', 'block_instance')),
	CONSTRAINT "comment_status" CHECK ("comment"."status" IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_target_type" CHECK ("follow"."target_type" IN ('tag', 'author', 'framework', 'study'))
);
--> statement-breakpoint
CREATE TABLE "mention" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"source_event_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_related_author_user_id_user_id_fk" FOREIGN KEY ("related_author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_mentioned_user_id_user_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_event_recent" ON "activity_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_event_tag" ON "activity_event" USING gin ("related_tag_slugs");--> statement-breakpoint
CREATE INDEX "idx_activity_event_author" ON "activity_event" USING btree ("related_author_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_event_framework" ON "activity_event" USING btree ("related_framework_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_event_study" ON "activity_event" USING btree ("related_study_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_comment_target" ON "comment" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_comment_experiment" ON "comment" USING btree ("experiment_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "follow_user_target_unique" ON "follow" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_follow_user" ON "follow" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_follow_target" ON "follow" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_comment_user_unique" ON "mention" USING btree ("comment_id","mentioned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_event_unique" ON "notification" USING btree ("recipient_user_id","source_event_id");--> statement-breakpoint
CREATE INDEX "idx_notification_recipient_unread" ON "notification" USING btree ("recipient_user_id") WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_notification_recipient_recent" ON "notification" USING btree ("recipient_user_id","created_at" DESC NULLS LAST);