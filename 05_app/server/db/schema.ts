/**
 * Drizzle schema — the single source of truth for the database shape.
 *
 * Derived from:
 *   - 04_architecture/data-model/01-auth-tenancy-entities.md  (user, workspace, member)
 *   - 04_architecture/data-model/00-core-entities.md          (experiment, experiment_version)
 *
 * Per ADR-0011: Drizzle owns the schema; no parallel raw-SQL source of truth.
 * "Workspace IS the tenant" — experiment.tenant_id is an FK to workspace.id
 * (the column name is kept for continuity with the data-model sketch +
 * ADR-0001/0002 language).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------- enums ---------- */

export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const memberStatus = pgEnum("member_status", ["active", "invited"]);

export const forkableBy = pgEnum("forkable_by", [
  "public",
  "link-only",
  "private",
]);

export const experimentVersionKind = pgEnum("experiment_version_kind", [
  "autosave",
  "named",
  "preregistered",
  "published",
]);

export const amendmentClassification = pgEnum("amendment_classification", [
  "typo",
  "methodological-correction",
  "clarification",
  "scope-change",
  "other",
]);

/* V1.5 — response/conditioning + registry (ADR-0014, ADR-0005) */

export const recruitmentStatus = pgEnum("recruitment_status", [
  "open",
  "paused",
  "closed",
]);

export const responseMode = pgEnum("response_mode", ["run", "preview"]);

export const responseStatus = pgEnum("response_status", [
  "started",
  "completed",
  "abandoned",
  "disqualified",
]);

export const registryPushStatus = pgEnum("registry_push_status", [
  "not_pushed",
  "pending",
  "pushed",
  "failed",
  "no_credentials",
  "opted_out",
]);

export const registryPushAttemptStatus = pgEnum("registry_push_attempt_status", [
  "pending",
  "pushed",
  "failed",
]);

/* ---------- auth + tenancy (data-model 01) ---------- */

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Auth provider's stable id (Clerk `user_...`). The only field an auth-vendor migration rewrites. Maps to AuthUser.id. */
  externalId: text("external_id").notNull().unique(),
  /** Canonicalized lowercase. */
  email: text("email").notNull().unique(),
  /** May be empty until onboarding completes. */
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  // Researcher profile (V1.12 A2; additive, nullable). Reused by OSF
  // preregistration metadata, the public author byline, and V1.13 Participants.
  /** Legal/full name (distinct from displayName) — OSF authors + byline. */
  fullName: text("full_name"),
  /** Institution + department, free text. */
  affiliation: text("affiliation"),
  /** ORCID iD, format XXXX-XXXX-XXXX-XXXX. */
  orcid: text("orcid"),
  /** Research-area tags (reuses the V1.7 tag-primitive shape). */
  researchAreas: jsonb("research_areas").$type<string[]>().notNull().default([]),
  /** Short markdown bio for the public author page. */
  bio: text("bio"),
  /** Personal website URL. */
  websiteUrl: text("website_url"),
  /** Google Scholar (or similar) profile URL. */
  scholarUrl: text("scholar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Show seeded demo content (is_demo studies) in this workspace's lists (ADR-0023). */
  showDemoContent: boolean("show_demo_content").notNull().default(false),
});

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    /** Null only for a pending `invited` row before the user exists. */
    userId: uuid("user_id").references(() => user.id),
    role: memberRole("role").notNull(),
    status: memberStatus("status").notNull().default("active"),
    invitedBy: uuid("invited_by").references((): AnyPgColumn => user.id),
    invitedEmail: text("invited_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A user is a member of a workspace at most once. Invited rows have a null
    // user_id, which is distinct under a unique index, so multiple pending
    // invites coexist without collision.
    uniqueIndex("member_workspace_user_unique").on(t.workspaceId, t.userId),
    check(
      "member_status_user_consistency",
      sql`("status" = 'active' AND "user_id" IS NOT NULL) OR ("status" = 'invited' AND "invited_email" IS NOT NULL)`,
    ),
  ],
);

/**
 * Custom composite module (ADR-0029) — a reusable group template, workspace-
 * scoped. `definition` is `{ title?: string, blocks: SavedBlock[] }`; inserting
 * one copies its blocks into a study (fresh ids), so it's a template, not a link.
 */
export const customModule = pgTable("custom_module", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => workspace.id),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  /** Published to the cross-workspace Community library (ADR-0038). */
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- change proposals (ADR-0036, PR-lite) ---------- */

/**
 * A replicator's offer of their divergence back to the upstream study. Self-
 * contained: `proposed_snapshot` is a FROZEN copy of the fork's definition at
 * propose time, so review never reads the fork again (the proposal row is the
 * second sanctioned cross-tenant surface after ADR-0018's fork-source read).
 */
export const changeProposal = pgTable("change_proposal", {
  id: text("id").primaryKey(), // ULID
  sourceExperimentId: uuid("source_experiment_id")
    .notNull()
    .references(() => experiment.id),
  targetExperimentId: uuid("target_experiment_id")
    .notNull()
    .references(() => experiment.id),
  proposerUserId: uuid("proposer_user_id")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  proposedSnapshot: jsonb("proposed_snapshot").notNull(),
  status: text("status").notNull().default("open"), // open | accepted | declined | withdrawn
  decisionComment: text("decision_comment"),
  decidedBy: uuid("decided_by").references(() => user.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- module catalogue (data-model 02 / ADR-0012) ---------- */

// NB: exported as `moduleTable`, NOT `module` — `module` is the CommonJS module
// wrapper object, which webpack passes as a parameter to every bundled module
// factory. A bare imported `module` gets shadowed by that param at runtime, so
// `module.id` resolves to the numeric webpack module id instead of this table's
// column (manifested in prod as `module_version.module_id = $1` with $1 = a
// chunk id, breaking the catalogue query). Always import as `moduleTable`.
export const moduleTable = pgTable(
  "module",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identity namespace. V1: always "core". */
    source: text("source").notNull(),
    /** Kebab-case key within source (e.g. "social-post"). */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** string[] for picker grouping / theme filtering. */
    categoryTags: jsonb("category_tags").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("module_source_key_unique").on(t.source, t.key)],
);

export const moduleVersion = pgTable(
  "module_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => moduleTable.id),
    /** Semver, e.g. "1.0.0". */
    version: text("version").notNull(),
    name: text("name").notNull(),
    /** JSON-Schema representation of the config (authoritative runtime schema is the in-repo Zod registry). */
    schema: jsonb("schema").notNull(),
    /** Config a freshly-added block starts with (valid against `schema`). */
    defaultConfig: jsonb("default_config").notNull(),
    changelog: text("changelog").notNull().default(""),
    isBreaking: boolean("is_breaking").notNull().default(false),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("module_version_unique").on(t.moduleId, t.version)],
);

/* ---------- core entities (data-model 00) ---------- */

export const experiment = pgTable(
  "experiment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The tenant boundary. "Workspace IS the tenant." */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => workspace.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Research-area tag slugs (ADR-0017) — the tag follow target's source; copied into activity_event.related_tag_slugs on emit. */
    tags: text("tags").array(),
    /** The working tip. Nullable until the first version is written (resolves the experiment<->version circular FK). */
    currentVersionId: uuid("current_version_id").references(
      (): AnyPgColumn => experimentVersion.id,
    ),
    forkableBy: forkableBy("forkable_by").notNull().default("private"),
    forkOfExperimentId: uuid("fork_of_experiment_id").references(
      (): AnyPgColumn => experiment.id,
    ),
    forkOfVersionId: uuid("fork_of_version_id").references(
      (): AnyPgColumn => experimentVersion.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Seeded demo study (ADR-0023) — excluded from /browse + public aggregates;
     *  shown in its workspace only when workspace.show_demo_content is on. */
    isDemo: boolean("is_demo").notNull().default(false),
  },
  () => [
    check(
      "experiment_fork_consistency",
      sql`("fork_of_experiment_id" IS NULL) = ("fork_of_version_id" IS NULL)`,
    ),
  ],
);

export const experimentVersion = pgTable(
  "experiment_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiment.id),
    /** Monotonic per experiment, starting at 1. */
    versionNumber: integer("version_number").notNull(),
    kind: experimentVersionKind("kind").notNull(),
    /** Required when kind != autosave (enforced by CHECK below). */
    name: text("name"),
    description: text("description"),
    definitionSnapshot: jsonb("definition_snapshot").notNull(),
    moduleVersionLocks: jsonb("module_version_locks").notNull(),
    /**
     * Whiteboard canvas viewport (ADR-0020): { x, y, zoom } pan/zoom + optional
     * per-node positions. Empty {} means "fit-to-screen on first render". On the
     * autosave tip this is mutable (debounce-written as the researcher pans/zooms);
     * frozen versions capture the viewport at snapshot time and never change.
     */
    whiteboardViewport: jsonb("whiteboard_viewport").notNull().default({}),
    themeId: uuid("theme_id"),
    themeSnapshot: jsonb("theme_snapshot"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    externalRegistrationUrl: text("external_registration_url"),
    externalPublicationUrl: text("external_publication_url"),
    supersedesVersionId: uuid("supersedes_version_id").references(
      (): AnyPgColumn => experimentVersion.id,
    ),
    changeSummary: text("change_summary"),
    amendmentClassification: amendmentClassification("amendment_classification"),
    // Registry/OSF push (ADR-0005). external_registration_url already exists above.
    registryPushStatus: registryPushStatus("registry_push_status")
      .notNull()
      .default("not_pushed"),
    registryPushAttempts: integer("registry_push_attempts").notNull().default(0),
    registryPushLastError: text("registry_push_last_error"),
    externalRegistrationDoi: text("external_registration_doi"),
  },
  (t) => [
    uniqueIndex("experiment_version_number_unique").on(
      t.experimentId,
      t.versionNumber,
    ),
    check(
      "experiment_version_name_required",
      sql`"kind" = 'autosave' OR "name" IS NOT NULL`,
    ),
    // ADR-0004: either both supersedes_version_id + change_summary are set
    // (an amendment) or both are null (an original version).
    check(
      "experiment_version_amendment_consistency",
      sql`("supersedes_version_id" IS NULL AND "change_summary" IS NULL) OR ("supersedes_version_id" IS NOT NULL AND "change_summary" IS NOT NULL AND length(trim("change_summary")) > 0)`,
    ),
  ],
);

/* ---------- response + conditioning (data-model 04 / ADR-0014) ---------- */

export const condition = pgTable(
  "condition",
  {
    id: text("id").primaryKey(), // ULID (app-generated)
    experimentVersionId: uuid("experiment_version_id")
      .notNull()
      .references(() => experimentVersion.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    allocationWeight: numeric("allocation_weight").notNull().default("1.0"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("condition_version_slug_unique").on(t.experimentVersionId, t.slug)],
);

export const recruitmentSession = pgTable("recruitment_session", {
  id: text("id").primaryKey(), // ULID; appears in the recruitment URL
  experimentVersionId: uuid("experiment_version_id")
    .notNull()
    .references(() => experimentVersion.id),
  status: recruitmentStatus("status").notNull().default("open"),
  targetN: integer("target_n"),
  currentN: integer("current_n").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
});

export const response = pgTable(
  "response",
  {
    id: text("id").primaryKey(), // ULID; the [sessionId] in /take URLs + the anonymous identifier
    recruitmentSessionId: text("recruitment_session_id")
      .notNull()
      .references(() => recruitmentSession.id),
    experimentVersionId: uuid("experiment_version_id")
      .notNull()
      .references(() => experimentVersion.id),
    conditionId: text("condition_id")
      .notNull()
      .references(() => condition.id),
    /** Opaque external recruitment id (Prolific PID etc.) — never a key, never demographic-joined. */
    externalPid: text("external_pid"),
    mode: responseMode("mode").notNull(),
    status: responseStatus("status").notNull().default("started"),
    currentQuestionIndex: integer("current_question_index").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    /** UA/locale/screen telemetry (no IP, no raw UA string — PII boundary, ADR-0014)
     *  plus `embedded`: researcher-declared URL params captured at start (ADR-0042). */
    clientMetadata: jsonb("client_metadata").notNull().default({}),
  },
  (t) => [
    // One completed take per external PID per session; nulls (direct recruitment) coexist.
    uniqueIndex("response_session_pid_unique")
      .on(t.recruitmentSessionId, t.externalPid)
      .where(sql`${t.externalPid} is not null`),
  ],
);

export const responseItem = pgTable(
  "response_item",
  {
    id: text("id").primaryKey(), // ULID
    responseId: text("response_id")
      .notNull()
      .references(() => response.id),
    /** Matches the block instanceId in definition_snapshot (ADR-0012). */
    blockInstanceId: text("block_instance_id").notNull(),
    blockPosition: integer("block_position").notNull(),
    moduleSource: text("module_source").notNull(),
    moduleKey: text("module_key").notNull(),
    moduleVersion: text("module_version").notNull(),
    /** Module-specific; validated against ModuleVersion.responseSchema (added when response-writing lands). */
    answer: jsonb("answer").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("response_item_unique").on(t.responseId, t.blockInstanceId)],
);

/* ---------- registry integration (data-model 05 / ADR-0005) ---------- */

export const registry = pgTable("registry", {
  id: text("id").primaryKey(), // ULID
  key: text("key").notNull().unique(), // 'osf' | 'aspredicted' | ...
  name: text("name").notNull(),
  oauthConfig: jsonb("oauth_config").notNull().default({}),
  pushConfig: jsonb("push_config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registryConnection = pgTable(
  "registry_connection",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    registryId: text("registry_id")
      .notNull()
      .references(() => registry.id),
    /** Encrypted at rest (AES-256-GCM); never plaintext in the DB. */
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    scopes: jsonb("scopes").notNull().default([]),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("registry_connection_user_registry_unique").on(t.userId, t.registryId)],
);

export const registryPush = pgTable("registry_push", {
  id: text("id").primaryKey(), // ULID
  experimentVersionId: uuid("experiment_version_id")
    .notNull()
    .references(() => experimentVersion.id),
  registryId: text("registry_id")
    .notNull()
    .references(() => registry.id),
  status: registryPushAttemptStatus("status").notNull().default("pending"),
  requestPayload: jsonb("request_payload").notNull(),
  responsePayload: jsonb("response_payload"),
  errorText: text("error_text"),
  pushedDoi: text("pushed_doi"),
  pushedUrl: text("pushed_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* ---------- V1.7: notifications, comments, activity (ADR-0015) ----------
 * Own PKs are text ULIDs; FKs to existing tables use their column type (uuid
 * for user/workspace/experiment), polymorphic refs are plain text — the V1.5
 * mixed-id pattern. target_type/status use text + CHECK (the ADR's open enums).
 */

// Comments on a study or a specific block instance.
export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    targetType: text("target_type").notNull(), // 'study' | 'block_instance'
    targetId: text("target_id").notNull(), // experiment.id (as text) OR block instanceId — polymorphic, no FK
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiment.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => user.id),
    bodyMd: text("body_md").notNull(),
    status: text("status").notNull().default("open"), // 'open' | 'resolved'
    resolvedByUserId: uuid("resolved_by_user_id").references(() => user.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [
    check("comment_target_type", sql`${t.targetType} IN ('study', 'block_instance')`),
    check("comment_status", sql`${t.status} IN ('open', 'resolved')`),
    index("idx_comment_target").on(t.targetType, t.targetId, t.createdAt.desc()),
    index("idx_comment_experiment").on(t.experimentId, t.createdAt.desc()),
  ],
);

// @mentions inside a comment, resolved at write time.
export const mention = pgTable(
  "mention",
  {
    id: text("id").primaryKey(), // ULID
    commentId: text("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => user.id),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mention_comment_user_unique").on(t.commentId, t.mentionedUserId)],
);

// One row per recipient × event — the Yours feed + unread counts.
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(), // ULID
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(), // EventType (open enum)
    sourceEventId: text("source_event_id").notNull(), // ULID of the originating activity_event (idempotency anchor)
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency: an event reaches a recipient at most once.
    uniqueIndex("notification_recipient_event_unique").on(t.recipientUserId, t.sourceEventId),
    index("idx_notification_recipient_unread")
      .on(t.recipientUserId)
      .where(sql`${t.readAt} IS NULL`),
    index("idx_notification_recipient_recent").on(t.recipientUserId, t.createdAt.desc()),
  ],
);

// Append-only event log — the Follows feed (and audit).
export const activityEvent = pgTable(
  "activity_event",
  {
    id: text("id").primaryKey(), // ULID
    type: text("type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    workspaceId: uuid("workspace_id").references(() => workspace.id), // nullable for cross-workspace events
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    // Denormalized "followable attributes" of the target — drives the Follows join.
    relatedTagSlugs: text("related_tag_slugs").array(),
    relatedAuthorUserId: uuid("related_author_user_id").references(() => user.id),
    relatedFrameworkId: text("related_framework_id"),
    relatedStudyId: text("related_study_id"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_activity_event_recent").on(t.createdAt.desc()),
    index("idx_activity_event_tag").using("gin", t.relatedTagSlugs),
    index("idx_activity_event_author").on(t.relatedAuthorUserId, t.createdAt.desc()),
    index("idx_activity_event_framework").on(t.relatedFrameworkId, t.createdAt.desc()),
    index("idx_activity_event_study").on(t.relatedStudyId, t.createdAt.desc()),
  ],
);

// A user's follow targets (tag / author / framework / study).
export const follow = pgTable(
  "follow",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    targetType: text("target_type").notNull(), // 'tag' | 'author' | 'framework' | 'study'
    targetId: text("target_id").notNull(), // tag slug, or the entity id (as text)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("follow_target_type", sql`${t.targetType} IN ('tag', 'author', 'framework', 'study')`),
    uniqueIndex("follow_user_target_unique").on(t.userId, t.targetType, t.targetId),
    index("idx_follow_user").on(t.userId),
    index("idx_follow_target").on(t.targetType, t.targetId),
  ],
);

/**
 * Public preview tokens (V1.12 I). A signed, expiring, revocable link that lets
 * someone WITHOUT an account view a draft study in preview mode (no responses
 * recorded). Only the SHA-256 hash of the token is stored; the plaintext is
 * shown once at creation and lives only in the shared URL.
 */
export const previewToken = pgTable(
  "preview_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiment.id),
    /** SHA-256 of the plaintext token (hex). The plaintext is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_preview_token_experiment").on(t.experimentId)],
);

/* ---------- inferred types ---------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type PreviewToken = typeof previewToken.$inferSelect;
export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Experiment = typeof experiment.$inferSelect;
export type ExperimentVersion = typeof experimentVersion.$inferSelect;
export type Module = typeof moduleTable.$inferSelect;
export type NewModule = typeof moduleTable.$inferInsert;
export type ModuleVersion = typeof moduleVersion.$inferSelect;
export type NewModuleVersion = typeof moduleVersion.$inferInsert;
export type Condition = typeof condition.$inferSelect;
export type NewCondition = typeof condition.$inferInsert;
export type RecruitmentSession = typeof recruitmentSession.$inferSelect;
export type NewRecruitmentSession = typeof recruitmentSession.$inferInsert;
export type Response = typeof response.$inferSelect;
export type NewResponse = typeof response.$inferInsert;
export type ResponseItem = typeof responseItem.$inferSelect;
export type NewResponseItem = typeof responseItem.$inferInsert;
export type Registry = typeof registry.$inferSelect;
export type RegistryConnection = typeof registryConnection.$inferSelect;
export type NewRegistryConnection = typeof registryConnection.$inferInsert;
export type RegistryPush = typeof registryPush.$inferSelect;
export type NewRegistryPush = typeof registryPush.$inferInsert;
export type Comment = typeof comment.$inferSelect;
export type NewComment = typeof comment.$inferInsert;
export type Mention = typeof mention.$inferSelect;
export type NewMention = typeof mention.$inferInsert;
export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
export type ActivityEvent = typeof activityEvent.$inferSelect;
export type NewActivityEvent = typeof activityEvent.$inferInsert;
export type Follow = typeof follow.$inferSelect;
export type NewFollow = typeof follow.$inferInsert;
