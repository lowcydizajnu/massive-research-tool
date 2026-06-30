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
  /** In-app announcements read marker (PF4): announcements with published_at >
   *  this are "unread". Null = never opened the panel. */
  lastSeenAnnouncementAt: timestamp("last_seen_announcement_at", { withTimezone: true }),
  /** Platform operator flag (ADR-0075). Gates the Admin destination via
   *  adminProcedure; supersedes the ADMIN_USER_IDS env stopgap (kept as a
   *  transitional fallback). Owner flips their own row TRUE in prod. */
  isAdmin: boolean("is_admin").notNull().default(false),
  // Public researcher profile (EE2, ADR-0077; opt-in, default off). The public
  // bio reuses the existing `bio` column above. `handle` is the public
  // identifier for /u/<handle> — lowercase alphanumeric + hyphens, unique.
  handle: text("handle").unique(),
  publicProfileEnabled: boolean("public_profile_enabled").notNull().default(false),
  /** Public-facing avatar (public R2 namespace); falls back to `avatarUrl`. */
  publicAvatarR2Key: text("public_avatar_r2_key"),
  /** Links to the researcher's already-published articles, shown on the public
   *  author page (feedback 01KW5CKK). Researcher-curated {title, url} pairs. */
  publicArticles: jsonb("public_articles")
    .$type<{ title: string; url: string }[]>()
    .notNull()
    .default([]),
  /** App-owned system account (EE2-misinfo): owns app-shipped starter templates.
   *  Excluded from the admin census + Explore (never a real researcher). */
  isSystem: boolean("is_system").notNull().default(false),
  /** Engagement email (EE3 / ADR-0081). Last authenticated activity (throttled to
   *  ≤1/12h) — drives the return-nudge dormancy window. */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /** Per-user opt-out of the weekly digest (Settings toggle; opt-out, not opt-in). */
  emailDigestOptedOut: boolean("email_digest_opted_out").notNull().default(false),
  /** Marketing/product-update consent (feedback #9). GDPR-clean explicit opt-IN,
   *  default OFF. DISTINCT from `emailDigestOptedOut` above: that is an opt-OUT of
   *  activity/engagement emails; this is an opt-IN to promotional product updates.
   *  Captured at signup (unchecked by default), editable later in Settings. */
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  /** Cooldown anchors so the workers never double-send. */
  digestLastSentAt: timestamp("digest_last_sent_at", { withTimezone: true }),
  nudgeLastSentAt: timestamp("nudge_last_sent_at", { withTimezone: true }),
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
  /** App-owned system workspace (holds app-shipped starter-template source
   *  studies). Excluded from the admin census; its studies stay private. */
  isSystem: boolean("is_system").notNull().default(false),
  /**
   * Member-management activity-event kinds hidden from this workspace's Activity
   * feed (V1.14 / ADR-0046). Empty = all kinds shown; non-empty = the listed
   * kinds are filtered out at query time. Owners/admins edit via Settings.
   */
  activityFilterKinds: jsonb("activity_filter_kinds").$type<string[]>().notNull().default([]),
  /**
   * Whether a platform operator may use "View as" to access this workspace for
   * support (ADR-0082). On by default; a workspace doing sensitive work can turn
   * it off so its studies/results are excluded from any impersonated view.
   */
  supportAccessEnabled: boolean("support_access_enabled").notNull().default(true),
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
    /** Soft-delete (V1.14 / ADR-0046): set to remove from active views while
     * preserving attribution on old activity/comments (tombstone display). */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references((): AnyPgColumn => user.id),
    /** Seeded demo teammate (ADR-0023) — Maya/Sofia from the network-demo seeds;
     *  hidden from the Team list unless workspace.show_demo_content is on, mirroring
     *  how experiment.is_demo gates demo studies. */
    isDemo: boolean("is_demo").notNull().default(false),
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
    /** Marked Finished (ADR-0054): data collection done, a Study Record exists.
     *  Gates Replicate (you replicate a finding, not a plan) + Browse landing.
     *  Nullable = not finished; reversible (reopen clears it). */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedByUserId: uuid("finished_by_user_id").references((): AnyPgColumn => user.id),
    /** Seeded demo study (ADR-0023) — excluded from /browse + public aggregates;
     *  shown in its workspace only when workspace.show_demo_content is on. */
    isDemo: boolean("is_demo").notNull().default(false),
    /** External research-panel / agency integration (ADR-0071) — operational
     *  recruitment config (NOT frozen with the version): respondent-id URL param,
     *  completion + consent-refusal redirects with delay/sticky-box, skip-refusal.
     *  Empty {} = standard flow. Structured fields only (no arbitrary code). */
    panelIntegration: jsonb("panel_integration").notNull().default({}),
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
    /** True once the registration is withdrawn/retracted on the registry (ADR-0005 am. 3),
     *  synced from getRegistrationStatus by refreshRegistration. */
    registrationWithdrawn: boolean("registration_withdrawn").notNull().default(false),
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
    /** Factorial-variant cell assigned at start (ADR-0058) — {factorId: levelId}; null = no variants. */
    variantCell: jsonb("variant_cell").$type<Record<string, string> | null>(),
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
    /**
     * Hume emotion analysis result (ADR-0066 H3a), when the block has emotion
     * analysis enabled. `{ emotions: {name: score}, transcript? }`. Filled by the
     * `hume.analyze` Inngest job after submit; null until then / when disabled.
     */
    emotionAnalysis: jsonb("emotion_analysis"),
    /** 'pending' (job enqueued) | 'ok' | 'failed'; null when emotion analysis is off. */
    emotionStatus: text("emotion_status"),
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

// === Recruitment providers (V1.15, ADR-0047) ============================
/** Recruitment providers we integrate with. `prolific` for V1.15.0; extends to cloudresearch/sona later. */
export const recruitmentProvider = pgEnum("recruitment_provider", ["prolific"]);
/** Connection health — `error` flips a connection to "Reconnect needed" when a provider call 401s. */
export const recruitmentConnectionStatus = pgEnum("recruitment_connection_status", ["active", "error"]);

/**
 * A researcher's connection to a recruitment provider, scoped per-workspace
 * (unlike OSF's per-researcher-global `registry_connection`). Tokens are
 * encrypted at rest (AES-256-GCM via TOKEN_ENCRYPTION_KEY); never plaintext.
 * Holds NO participant data (ADR-0014) — just the researcher's provider token.
 */
export const recruitmentProviderConnection = pgTable(
  "recruitment_provider_connection",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    provider: recruitmentProvider("provider").notNull(),
    /** Encrypted at rest (AES-256-GCM); never plaintext in the DB. */
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Opaque provider user id (from validateToken). Not PII. */
    providerUserId: text("provider_user_id"),
    status: recruitmentConnectionStatus("status").notNull().default("active"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("recruitment_conn_ws_user_provider_unique").on(t.workspaceId, t.userId, t.provider),
  ],
);
export type RecruitmentProviderConnection = typeof recruitmentProviderConnection.$inferSelect;
export type NewRecruitmentProviderConnection = typeof recruitmentProviderConnection.$inferInsert;

/**
 * A workspace's bring-your-own AI provider key (ADR-0061 / ADR-0006 BYO-key).
 * Mirrors recruitment_provider_connection: a pasted API key, validated against
 * the provider, encrypted at rest (AES-256-GCM via TOKEN_ENCRYPTION_KEY), one
 * row per (workspace, provider). The key is NEVER returned to the client — only
 * a masked hint + status. No participant data (ADR-0014).
 */
export const aiProviderConnection = pgTable(
  "ai_provider_connection",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    provider: text("provider").notNull(), // 'anthropic' | 'openai' | 'hume'
    /** Encrypted at rest (AES-256-GCM); never plaintext, never sent to the client. */
    apiKey: text("api_key").notNull(),
    /**
     * Hume needs two more encrypted keys (ADR-0067): the Secret key (paired with
     * the API key for EVI WebSocket auth) and the Webhook signing key (validates
     * incoming EVI events). Nullable — only Hume populates them.
     */
    secretKey: text("secret_key"),
    webhookSigningKey: text("webhook_signing_key"),
    /** Last 4 chars of the key for a "•••• 1a2b" hint in the UI. */
    keyHint: text("key_hint"),
    status: text("status").notNull().default("active"), // 'active' | 'error'
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_provider_connection_provider", sql`${t.provider} IN ('anthropic', 'openai', 'hume')`),
    check("ai_provider_connection_status", sql`${t.status} IN ('active', 'error')`),
    uniqueIndex("ai_provider_connection_ws_provider_unique").on(t.workspaceId, t.provider),
  ],
);
export type AiProviderConnection = typeof aiProviderConnection.$inferSelect;
export type NewAiProviderConnection = typeof aiProviderConnection.$inferInsert;

/**
 * Per-workspace AI invocation audit log (ADR-0066). One row per AI call, any
 * provider, any modality, written by the AI gateway (`server/runtime/ai-gateway.ts`)
 * — the single path from feature code to a vendor adapter. This is the spine for
 * cost metering, the budget cap, debugging, reproducibility, and the ADR-0014
 * withdraw cascade (rows for a participant's response are deleted on withdraw).
 * Large outputs (full emotion vectors, transcripts) go to the R2-backed
 * `ai_invocation_payload` sidecar; `result_summary` keeps only a small digest.
 */
export const aiInvocation = pgTable(
  "ai_invocation",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    /** Nullable: not every AI call is tied to a study (e.g. a connect test). */
    studyId: uuid("study_id").references((): AnyPgColumn => experiment.id, { onDelete: "set null" }),
    /** Participant response (ULID text), when the call is part of a run; cascades on withdraw/delete. */
    responseId: text("response_id").references((): AnyPgColumn => response.id, { onDelete: "cascade" }),
    blockInstanceId: text("block_instance_id"),
    /** The feature making the call, e.g. 'ai-chat' | 'voice-emotion-probe'. */
    feature: text("feature").notNull(),
    provider: text("provider").notNull(), // 'anthropic' | 'hume' | …
    model: text("model"),
    modality: text("modality").notNull(), // 'text' | 'voice' | 'tts' | 'conversation'
    sensitivity: text("sensitivity").notNull(), // 'researcher_content' | 'participant_data' | 'pii'
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    /** USD cost from the provider's reported usage (or a dated price table). */
    costUsd: numeric("cost_usd", { precision: 10, scale: 5 }).notNull().default("0"),
    status: text("status").notNull(), // 'ok' | 'error'
    errorCode: text("error_code"),
    /** Small digest only (top emotions + valence/arousal); full payload → sidecar. */
    resultSummary: jsonb("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_invocation_modality", sql`${t.modality} IN ('text', 'voice', 'tts', 'conversation')`),
    check(
      "ai_invocation_sensitivity",
      sql`${t.sensitivity} IN ('researcher_content', 'participant_data', 'pii')`,
    ),
    check("ai_invocation_status", sql`${t.status} IN ('ok', 'error')`),
    index("idx_ai_invocation_workspace_created").on(t.workspaceId, t.createdAt),
    index("idx_ai_invocation_response").on(t.responseId),
  ],
);
export type AiInvocation = typeof aiInvocation.$inferSelect;
export type NewAiInvocation = typeof aiInvocation.$inferInsert;

/** R2-backed sidecar for large AI outputs (full emotion vectors, transcripts). ADR-0066/0003. */
export const aiInvocationPayload = pgTable("ai_invocation_payload", {
  invocationId: text("invocation_id")
    .primaryKey()
    .references(() => aiInvocation.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
});
export type AiInvocationPayload = typeof aiInvocationPayload.$inferSelect;

/**
 * Per-workspace AI policy + budget (ADR-0066). One row per workspace, created
 * lazily. `allowPiiToExternalAi` gates any `pii`-sensitivity call (default false —
 * researcher must opt in). `monthlyBudgetUsdCap` is a hard monthly spend ceiling
 * (null = uncapped; existing workspaces stay uncapped, new ones default to $50 in
 * V2.1 H8c). Enforced by the gateway.
 */
export const workspaceAiSettings = pgTable("workspace_ai_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id),
  allowPiiToExternalAi: boolean("allow_pii_to_external_ai").notNull().default(false),
  monthlyBudgetUsdCap: numeric("monthly_budget_usd_cap", { precision: 10, scale: 2 }),
  updatedByUserId: uuid("updated_by_user_id").references((): AnyPgColumn => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WorkspaceAiSettings = typeof workspaceAiSettings.$inferSelect;

/**
 * Per-workspace webhook subscription with a recruitment provider (V1.15 / ADR-0050).
 * Prolific "hooks" are API-created (no dashboard UI) and sign each event with a
 * PER-WORKSPACE secret (from POST /hooks/secrets/). We store that signing secret
 * encrypted and the provider subscription ids so we can verify incoming pings and
 * tear them down on disable. The webhook target URL carries the workspace id, so
 * the receiver can look up THIS secret before trusting the payload.
 */
export const recruitmentProviderWebhook = pgTable(
  "recruitment_provider_webhook",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    provider: recruitmentProvider("provider").notNull(),
    /** Provider signing secret (from /hooks/secrets/), encrypted at rest (AES-256-GCM). */
    signingSecret: text("signing_secret").notNull(),
    /** Provider subscription ids we created (one per subscribed event type). */
    subscriptions: jsonb("subscriptions").notNull().default([]),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references((): AnyPgColumn => user.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recruitment_webhook_ws_provider_unique").on(t.workspaceId, t.provider)],
);
export type RecruitmentProviderWebhook = typeof recruitmentProviderWebhook.$inferSelect;

/**
 * One row per participant attempt on a provider's side (V1.15 Stream P2 /
 * ADR-0047). Fed by reconcile-on-read (listSubmissions) now; webhooks + a polling
 * job later. PII-safe (ADR-0014): identified ONLY by the opaque `externalPid` +
 * our own `recruitmentSessionId` — never names/emails/IPs. `submissionId` is the
 * provider's id; UNIQUE(provider, submissionId) makes upserts idempotent.
 */
export const providerSubmission = pgTable(
  "provider_submission",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    experimentId: uuid("experiment_id")
      .notNull()
      .references((): AnyPgColumn => experiment.id),
    recruitmentSessionId: text("recruitment_session_id").references(() => recruitmentSession.id),
    provider: recruitmentProvider("provider").notNull(),
    providerStudyId: text("provider_study_id").notNull(),
    submissionId: text("submission_id").notNull(),
    /** Opaque provider participant id — the ONLY identifier (ADR-0014). */
    externalPid: text("external_pid").notNull(),
    status: text("status").notNull(), // started | submitted | approved | rejected | timed-out
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references((): AnyPgColumn => user.id),
    rewardAmountCents: integer("reward_amount_cents"),
    currency: text("currency"),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("provider_submission_provider_submission_unique").on(t.provider, t.submissionId),
    index("idx_provider_submission_experiment").on(t.experimentId, t.status),
    index("idx_provider_submission_workspace").on(t.workspaceId, t.status),
    index("idx_provider_submission_pid").on(t.externalPid),
  ],
);
export type ProviderSubmission = typeof providerSubmission.$inferSelect;
export type NewProviderSubmission = typeof providerSubmission.$inferInsert;

/**
 * A researcher-curated cohort of past participants (V1.15 Stream P3 / ADR-0051).
 * Workspace-scoped; used to re-recruit or exclude participants in a new study.
 * PII-blind (ADR-0014): membership is keyed ONLY by the opaque `external_pid`.
 */
export const panel = pgTable(
  "panel",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references((): AnyPgColumn => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_panel_workspace").on(t.workspaceId)],
);
export type Panel = typeof panel.$inferSelect;

/**
 * One opaque participant id in a panel (ADR-0051). NEVER PII — only the
 * provider's `external_pid` + first-source provenance. UNIQUE(panel, pid) makes
 * "add from a study" idempotent. Cascade-deletes with its panel.
 */
export const panelMember = pgTable(
  "panel_member",
  {
    id: text("id").primaryKey(), // ULID
    panelId: text("panel_id")
      .notNull()
      .references(() => panel.id, { onDelete: "cascade" }),
    externalPid: text("external_pid").notNull(),
    /** The study this PID was first added from (provenance hint, not an audit trail). */
    sourceExperimentId: uuid("source_experiment_id").references((): AnyPgColumn => experiment.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("panel_member_panel_pid_unique").on(t.panelId, t.externalPid)],
);
export type PanelMember = typeof panelMember.$inferSelect;

export const payoutKind = pgEnum("payout_kind", ["reward", "bonus"]);

/**
 * Append-only mirror of participant-spend events (V1.15 Stream P4 / ADR-0048).
 * We NEVER process money — this records what the provider charged the researcher
 * (a reward when a submission is approved; a bonus when one is sent) for unified
 * spend visibility. No financial PII. `decidedByUserId` is null when the approval
 * happened on the provider (reconciled), set when a workspace user decided it.
 */
export const payoutRecord = pgTable(
  "payout_record",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    experimentId: uuid("experiment_id")
      .notNull()
      .references((): AnyPgColumn => experiment.id),
    providerSubmissionId: text("provider_submission_id").references((): AnyPgColumn => providerSubmission.id),
    kind: payoutKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    decidedByUserId: uuid("decided_by_user_id").references((): AnyPgColumn => user.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one REWARD payout per submission (idempotent reconcile); bonuses can repeat.
    uniqueIndex("payout_record_submission_reward_unique")
      .on(t.providerSubmissionId)
      .where(sql`${t.kind} = 'reward'`),
    index("idx_payout_workspace").on(t.workspaceId),
    index("idx_payout_experiment").on(t.experimentId),
  ],
);
export type PayoutRecord = typeof payoutRecord.$inferSelect;

/** Optional owner-set monthly participant-spend budget (advisory alerts only; ADR-0048). One per workspace. */
export const workspacePayoutBudget = pgTable("workspace_payout_budget", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id),
  monthlyLimitCents: integer("monthly_limit_cents").notNull(),
  currency: text("currency").notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(100),
  updatedByUserId: uuid("updated_by_user_id").references((): AnyPgColumn => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WorkspacePayoutBudget = typeof workspacePayoutBudget.$inferSelect;

/**
 * Opt-in auto-approval policy (V1.15 / ADR-0053). When enabled, the hourly job
 * auto-approves a submission ONLY if it has no open quality flag AND has been
 * awaiting review >= minAgeHours — never a flagged participant. Owner/admin set;
 * one per workspace. Disabled by default (money automation is opt-in).
 */
export const workspaceAutoApprovalPolicy = pgTable("workspace_auto_approval_policy", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id),
  enabled: boolean("enabled").notNull().default(false),
  minAgeHours: integer("min_age_hours").notNull().default(24),
  updatedByUserId: uuid("updated_by_user_id").references((): AnyPgColumn => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WorkspaceAutoApprovalPolicy = typeof workspaceAutoApprovalPolicy.$inferSelect;

export const qualityFlagKind = pgEnum("quality_flag_kind", [
  "fast_completion",
  "straight_lining",
  "duplicate_pid",
  "manual",
  // shape-ready, rules land later (ADR-0049): attention-check, slow, spam-text.
  "slow_completion",
  "attention_check",
  "spam_text",
]);
export const qualitySeverity = pgEnum("quality_severity", ["low", "medium", "high"]);
export const qualityResolution = pgEnum("quality_resolution", ["approved", "rejected", "dismissed"]);

/**
 * One flag on a participant submission worth review before approval (V1.15 P5 /
 * ADR-0049). Append-only: detection inserts idempotently; resolution is a state
 * transition (never deleted — audit trail). PII-safe: only the opaque external_pid
 * + our own response/submission ids. Detection is OUR heuristic over response data;
 * the provider exposes no quality signal.
 */
export const qualityFlag = pgTable(
  "quality_flag",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    experimentId: uuid("experiment_id")
      .notNull()
      .references((): AnyPgColumn => experiment.id),
    responseId: text("response_id").references((): AnyPgColumn => response.id),
    providerSubmissionId: text("provider_submission_id").references((): AnyPgColumn => providerSubmission.id),
    externalPid: text("external_pid"),
    flagKind: qualityFlagKind("flag_kind").notNull(),
    severity: qualitySeverity("severity").notNull(),
    autoDetected: boolean("auto_detected").notNull().default(true),
    detail: text("detail"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references((): AnyPgColumn => user.id),
    resolution: qualityResolution("resolution"),
    resolutionNote: text("resolution_note"),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotent auto-detection: one auto flag per (response, kind). Manual flags (auto=false) can repeat.
    uniqueIndex("quality_flag_response_kind_unique")
      .on(t.responseId, t.flagKind)
      .where(sql`${t.autoDetected} = true`),
    index("idx_quality_workspace_resolved").on(t.workspaceId, t.resolvedAt),
    index("idx_quality_experiment").on(t.experimentId),
  ],
);
export type QualityFlag = typeof qualityFlag.$inferSelect;

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
    targetType: text("target_type").notNull(), // 'study' | 'block_instance' | 'playground_card'
    targetId: text("target_id").notNull(), // experiment.id (as text) OR block instanceId OR playground_card.id — polymorphic, no FK
    // Nullable since ADR-0059: playground-card comments have no study (experimentId IS NULL).
    // Study/block comments always set it; the index below still serves study threads.
    experimentId: uuid("experiment_id").references(() => experiment.id),
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
    check(
      "comment_target_type",
      sql`${t.targetType} IN ('study', 'block_instance', 'playground_card')`,
    ),
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

/**
 * Live-cooperation presence (ADR-0060). One ephemeral row per (study, user):
 * a heartbeat that records which block a collaborator is focused on. Read by
 * others on a short poll to render avatars + a per-block "who's editing" border.
 * Non-authoritative + non-PII (no participant data) — edits still flow through
 * the normal mutations under last-write-wins (ADR-0012). The V1 transport is
 * this table + polling, behind the RealtimeAdapter seam (Liveblocks/Yjs later).
 */
export const studyPresence = pgTable(
  "study_presence",
  {
    studyId: uuid("study_id")
      .notNull()
      .references(() => experiment.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    blockId: text("block_id"), // the focused block instanceId, or null
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("study_presence_study_user_unique").on(t.studyId, t.userId),
    index("idx_study_presence_study").on(t.studyId, t.updatedAt.desc()),
  ],
);

/**
 * Playground / Cowork board card (ADR-0059). One owned primitive: a typed,
 * orderable card that lives *before* a study exists. Everything else is reused —
 * comments via `comment` (targetType 'playground_card'), images/files via the
 * `/api/media` gateway (`mediaKey`), references via the Crossref adapter (`refDoi`),
 * conversion via `studies.create` (`convertedStudyId` records the linkage).
 *
 * Phase 1 kinds: link | note | image | file | reference. Phase 2 adds todo | poll
 * and turns on `assigneeUserId` / `done` (left null/false until then). The whole
 * table is additive — a workspace with no cards behaves exactly as today.
 */
export const playgroundCard = pgTable(
  "playground_card",
  {
    id: text("id").primaryKey(), // ULID (matches comment.id convention)
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    kind: text("kind").notNull(), // 'link'|'note'|'image'|'file'|'reference'|'todo'|'poll'
    title: text("title"),
    body: text("body"), // markdown (note/question)
    url: text("url"), // link cards
    mediaKey: text("media_key"), // image/file cards — /api/media key
    refDoi: text("ref_doi"), // reference cards — resolved via Crossref
    // Phase 2 (poll) — the choices; null for non-poll kinds.
    pollOptions: jsonb("poll_options").$type<{ id: string; label: string }[] | null>(),
    // Phase 2/3 (todo).
    assigneeUserId: uuid("assignee_user_id").references(() => user.id), // card-level assignee (notified)
    done: boolean("done").notNull().default(false), // legacy single-item flag; multi-item lives in todoItems
    // Phase 3 (todo) — the checklist; null for non-todo kinds. Each item can carry
    // its own assignee (ADR-0059 P3 amendment — assignment is per item, not per card).
    todoItems: jsonb("todo_items").$type<
      { id: string; label: string; done: boolean; assigneeUserId?: string | null }[] | null
    >(),
    // Board ordering (drag-to-reorder); fractional so inserts don't renumber.
    position: numeric("position").notNull().default("0"),
    // Non-destructive convert-to-study linkage (ADR-0059): set, source kept.
    convertedStudyId: uuid("converted_study_id").references(() => experiment.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "playground_card_kind",
      sql`${t.kind} IN ('link', 'note', 'image', 'file', 'reference', 'todo', 'poll')`,
    ),
    // The board query: a workspace's live cards in board order.
    index("idx_playground_card_board").on(t.workspaceId, t.position),
  ],
);

/**
 * One member's vote on a poll card (ADR-0059 Phase 2). Single-choice: a unique
 * (card, user) means a member has at most one vote per card; re-voting updates
 * `optionId`. `optionId` refers to an entry in `playground_card.poll_options`.
 * No generic reaction primitive existed at build time, so this is the minimal
 * dedicated table the ADR anticipated.
 */
export const playgroundCardVote = pgTable(
  "playground_card_vote",
  {
    id: text("id").primaryKey(), // ULID
    cardId: text("card_id")
      .notNull()
      .references(() => playgroundCard.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    optionId: text("option_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("playground_card_vote_card_user_unique").on(t.cardId, t.userId),
    index("idx_playground_card_vote_card").on(t.cardId),
  ],
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

// Study edit event log (ADR-0086): an ADVISORY, append-only trail of researcher
// edits to a study's working draft, surfaced as the changelog "Detailed" timeline.
// Never authoritative (snapshots + frozen versions remain the source of truth),
// never gates anything, never exported/published. Deliberately NOT activity_event
// (ADR-0014) so high-frequency edits don't pollute the followable activity feed.
// `recordStudyEdit` coalesces same-(study,actor,kind) edits within a short window.
export const studyEditEvent = pgTable(
  "study_edit_event",
  {
    id: text("id").primaryKey(), // ULID; append order = chronological
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiment.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // blocks | theme | social-post | consent | overview | conditions | variants | wording | title | irb
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_study_edit_event_study").on(t.experimentId, t.createdAt.desc())],
);

// Cookie-consent ledger (legal-baseline LG2, ADR-0072 prereq). One row per
// consent choice; `user_id` null for pre-signup choices (matched on signup via
// the `pre_signup_id` carried in localStorage). PII-safe (ADR-0014): only a
// one-way UA hash + coarse country, never raw IP/UA.
export const cookieConsent = pgTable(
  "cookie_consent",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    preSignupId: text("pre_signup_id"),
    choice: text("choice").notNull(),
    cookiePolicyVersion: integer("cookie_policy_version").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    userAgentHash: text("user_agent_hash"),
    ipCountry: text("ip_country"),
  },
  (t) => [
    check("cookie_consent_choice", sql`${t.choice} IN ('all', 'necessary')`),
    index("idx_cookie_consent_user").on(t.userId, t.recordedAt.desc()),
    index("idx_cookie_consent_presignup").on(t.preSignupId, t.recordedAt.desc()),
  ],
);

// Legal-document acceptance ledger (legal-baseline LG3). One row per (user,
// document kind, version) the user has accepted — drives the version-bump
// re-prompt. PII-safe (ADR-0014): one-way UA hash + coarse country only.
export const legalAcceptance = pgTable(
  "legal_acceptance",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentKind: text("document_kind").notNull(),
    documentVersion: integer("document_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    ipCountry: text("ip_country"),
    userAgentHash: text("user_agent_hash"),
  },
  (t) => [
    check("legal_acceptance_kind", sql`${t.documentKind} IN ('terms', 'privacy', 'cookies')`),
    index("idx_legal_acceptance_user_kind").on(t.userId, t.documentKind, t.documentVersion),
  ],
);

// In-app product feedback (platform-foundation PF2, ADR-0072). One row per
// submission, tagged to the submitter + (if applicable) their workspace and the
// study they were viewing. PII-safe (ADR-0014): one-way UA hash + coarse
// country only — never raw IP / raw user-agent. FKs SET NULL so feedback
// survives workspace/study/user deletion for triage history.
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id").references(() => workspace.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    routeName: text("route_name"),
    userAgentHash: text("user_agent_hash"),
    ipCountry: text("ip_country"),
    screenshotR2Key: text("screenshot_r2_key"),
    studyId: uuid("study_id").references(() => experiment.id, { onDelete: "set null" }),
    status: text("status").notNull().default("new"),
    adminNotes: text("admin_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("feedback_kind", sql`${t.kind} IN ('bug', 'idea', 'question', 'other')`),
    check(
      "feedback_status",
      sql`${t.status} IN ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate')`,
    ),
    index("idx_feedback_status_created").on(t.status, t.createdAt.desc()),
  ],
);

// In-app "what's new" announcements (platform-foundation PF4, ADR-0072).
// Published by an admin; surfaced to every researcher in the TopBar ✨ widget.
// Read state is per-user via user.last_seen_announcement_at (a published_at >
// last_seen comparison), so no join table.
export const releaseAnnouncement = pgTable(
  "release_announcement",
  {
    id: text("id").primaryKey(), // ULID
    title: text("title").notNull(),
    body: text("body").notNull(), // short markdown (rendered with the ADR-0015 allowlist)
    imageR2Key: text("image_r2_key"),
    learnMoreUrl: text("learn_more_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    publishedByUserId: uuid("published_by_user_id")
      .notNull()
      .references(() => user.id),
  },
  (t) => [index("idx_release_announcement_published").on(t.publishedAt.desc())],
);

// Append-only audit of admin read-only "view-as researcher" sessions (ADR-0075).
// Every enter/exit is logged; impersonation is read-only (writes are blocked at
// the tRPC layer) and never act-as.
export const adminViewAsLog = pgTable(
  "admin_view_as_log",
  {
    id: text("id").primaryKey(), // ULID
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // 'enter' | 'exit'
    /** Break-glass typed reason captured on enter (ADR-0082). Null on exit rows. */
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("admin_view_as_action", sql`${t.action} IN ('enter', 'exit')`),
    index("idx_admin_view_as_admin").on(t.adminUserId, t.at.desc()),
  ],
);

// A user's follow targets (tag / author / framework / study / module).
export const follow = pgTable(
  "follow",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    targetType: text("target_type").notNull(), // 'tag' | 'author' | 'framework' | 'study' | 'module'
    targetId: text("target_id").notNull(), // tag slug, the entity id (as text), or a module "source/key"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("follow_target_type", sql`${t.targetType} IN ('tag', 'author', 'framework', 'study', 'module')`),
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

/* ---------- dashboard customization (ADR-0045) ---------- */

/**
 * Per-user dashboard layout override. One row per (user, dashboard kind,
 * workspace). `workspace_id` is NULL for the personal `/home` dashboard and set
 * for a per-workspace `/dashboard`. `widgets` is the ordered list the resolver
 * renders; unknown keys are filtered at resolve time (forward-compat, ADR-0045).
 * The unique index enforces one row per (user, kind, workspace) for workspace
 * dashboards; for the personal dashboard (`workspace_id IS NULL`, where Postgres
 * treats NULLs as distinct) the single-row invariant is held by the app-layer
 * upsert in `dashboard.saveLayout` (select-then-write).
 */
export const dashboardLayout = pgTable(
  "dashboard_layout",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dashboardKind: text("dashboard_kind").notNull(), // 'user' | 'workspace'
    workspaceId: uuid("workspace_id").references(() => workspace.id, { onDelete: "cascade" }), // null for 'user'
    widgets: jsonb("widgets")
      .notNull()
      .$type<{ widgetKey: string; settings?: Record<string, unknown> }[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dashboard_layout_user_kind_ws_unique").on(t.userId, t.dashboardKind, t.workspaceId),
    index("idx_dashboard_layout_user").on(t.userId),
  ],
);

/**
 * Workspace admin "house default" layout for the workspace dashboard. New
 * members inherit this until they customize per-user (ADR-0045). One row per
 * workspace; writes are admin-only (enforced in the tRPC layer).
 */
export const workspaceDashboardDefault = pgTable("workspace_dashboard_default", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  widgets: jsonb("widgets")
    .notNull()
    .$type<{ widgetKey: string; settings?: Record<string, unknown> }[]>(),
  setByUserId: uuid("set_by_user_id")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- study record (ADR-0054 §41) ---------- */

/**
 * The composed Study Record for a finished study — one row per experiment. The
 * readable, citable "publication" face (Slice 2). `layout` is the ordered list
 * of section instances the composer persists, mirroring `dashboard_layout`'s
 * model: bound sections (`method`/`results`/`data`/`preregistration`/
 * `replications`/`materials`) carry only `{type, hidden}` and resolve from study
 * data server-side; authored sections (`abstract`/`narrative`/`article-link`/
 * `custom`) carry `content`. `abstract` is also a top-level column because a
 * public Record requires it (validated at publish). `visibility` is
 * `workspace` | `public` (text + Zod-validated, mirroring `dashboard_kind`).
 * Public sections never resolve participant PII (ADR-0014) — enforced in the
 * resolvers, not here. `published_at` stamps the first public publish.
 */
export const studyRecord = pgTable("study_record", {
  experimentId: uuid("experiment_id")
    .primaryKey()
    .references(() => experiment.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull().default("workspace"), // 'workspace' | 'public'
  abstract: text("abstract"),
  articleUrl: text("article_url"),
  articleDoi: text("article_doi"),
  layout: jsonb("layout")
    .notNull()
    .default(sql`'[]'::jsonb`)
    // RecordSection[] (ADR-0056): bound sections accept title/content overrides;
    // hypotheses carry optional structured `fields`. jsonb — extending is migration-free.
    .$type<
      { type: string; title?: string; content?: string; hidden?: boolean; fields?: Record<string, string> }[]
    >(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  // Publishable dataset (ADR-0056 amendment / E2) — researcher opt-in, default off.
  // `data_table` is an immutable snapshot ({headers, rows}) built at publish from
  // the Export Data view, with the owner's chosen columns (PID excluded by default).
  dataPublished: boolean("data_published").notNull().default(false),
  dataTable: jsonb("data_table").$type<{ headers: string[]; rows: string[][] } | null>(),
  // OSF push state (ADR-0056 E4b / item 2): the sha256 of the summary text last
  // pushed to the project node + when. Lets the composer say "up to date on OSF"
  // vs "changes to push" instead of pushing blind every click.
  osfPushedHash: text("osf_pushed_hash"),
  osfPushedAt: timestamp("osf_pushed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Saved / bookmarked studies (ADR-0056) — a per-user reading list, distinct from
 * Follow (which feeds the activity stream). One row per (user, study); surfaced
 * on the personal dashboard. Cascades on user/study delete.
 */
export const savedRecord = pgTable(
  "saved_record",
  {
    id: text("id").primaryKey(), // ULID
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiment.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_record_user_study_unique").on(t.userId, t.experimentId),
    index("idx_saved_record_user").on(t.userId),
  ],
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
export type StudyRecord = typeof studyRecord.$inferSelect;
export type NewStudyRecord = typeof studyRecord.$inferInsert;
export type SavedRecord = typeof savedRecord.$inferSelect;
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
export type PlaygroundCard = typeof playgroundCard.$inferSelect;
export type NewPlaygroundCard = typeof playgroundCard.$inferInsert;
export type PlaygroundCardVote = typeof playgroundCardVote.$inferSelect;
export type NewPlaygroundCardVote = typeof playgroundCardVote.$inferInsert;
export type StudyPresence = typeof studyPresence.$inferSelect;
export type NewStudyPresence = typeof studyPresence.$inferInsert;
export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
export type ActivityEvent = typeof activityEvent.$inferSelect;
export type NewActivityEvent = typeof activityEvent.$inferInsert;
export type Follow = typeof follow.$inferSelect;
export type NewFollow = typeof follow.$inferInsert;
export type DashboardLayout = typeof dashboardLayout.$inferSelect;
export type NewDashboardLayout = typeof dashboardLayout.$inferInsert;
export type WorkspaceDashboardDefault = typeof workspaceDashboardDefault.$inferSelect;
export type NewWorkspaceDashboardDefault = typeof workspaceDashboardDefault.$inferInsert;

/**
 * Workspace Templates (ADR-0063, Library L1). A named, curated study skeleton
 * pinned to a FROZEN experiment_version. "Save as template" freezes the working
 * tip (studies.saveAsNamed) then writes this row; "Use template" clones the
 * frozen version via studies.fork. Decoupled from the source study's edit
 * lifecycle. Soft-deleted (deleted_at) so use-history degrades gracefully.
 */
export const workspaceTemplate = pgTable(
  "workspace_template",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    /** The study this was captured from (lineage; the study keeps evolving). */
    sourceExperimentId: uuid("source_experiment_id")
      .notNull()
      .references(() => experiment.id),
    /** The frozen named version the template clones from (stable reference). */
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => experimentVersion.id),
    name: text("name").notNull(),
    description: text("description"),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    /** Optional preview image in the ws/ (public-readable) R2 namespace. */
    coverImageR2Key: text("cover_image_r2_key"),
    /** Visibility: private (author workspace) | workspace (members) | public (any workspace). */
    shareScope: text("share_scope").notNull().default("private"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => user.id),
    /** Denormalized; incremented on each fork-from-template. */
    useCount: integer("use_count").notNull().default(0),
    /** TRUE for app-shipped starter templates (public, app-owned). */
    starter: boolean("starter").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete — hidden from lists; preserved for use-history + in-flight views. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "workspace_template_share_scope",
      sql`${t.shareScope} IN ('private', 'workspace', 'public')`,
    ),
    index("idx_workspace_template_ws").on(t.workspaceId, t.createdAt),
    index("idx_workspace_template_scope").on(t.shareScope),
  ],
);

export type WorkspaceTemplate = typeof workspaceTemplate.$inferSelect;
export type NewWorkspaceTemplate = typeof workspaceTemplate.$inferInsert;

/**
 * Workspace Materials (ADR-0064, Library L3). A reusable stimulus-media library
 * at the workspace level: the row is curated metadata over an asset stored in the
 * R2 `ws/<workspace>/materials/` namespace. Blocks reference the `r2_key` (NOT
 * this row's id) so deleting a material never breaks a study and frozen versions
 * don't mutate. Researcher stimuli, not participant PII (ADR-0014). Soft-deleted.
 */
export const workspaceMaterial = pgTable(
  "workspace_material",
  {
    id: text("id").primaryKey(), // ULID
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    kind: text("kind").notNull(), // 'image' | 'audio' | 'video' | 'document'
    name: text("name").notNull(),
    description: text("description"),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    /** The durable reference — blocks point at this key, never the row id. */
    r2Key: text("r2_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => user.id),
    /** Provenance (ADR-0064): how the asset entered the library. */
    sourceKind: text("source_kind").notNull().default("upload"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("workspace_material_kind", sql`${t.kind} IN ('image', 'audio', 'video', 'document')`),
    check(
      "workspace_material_source_kind",
      sql`${t.sourceKind} IN ('upload', 'study-block-promote', 'playground-promote', 'tts-cache')`,
    ),
    index("idx_workspace_material_ws").on(t.workspaceId, t.kind, t.createdAt),
  ],
);

export type WorkspaceMaterial = typeof workspaceMaterial.$inferSelect;
export type NewWorkspaceMaterial = typeof workspaceMaterial.$inferInsert;

/**
 * Operator metric snapshot cache (ADR-0080). One row per external-metric source
 * (e.g. `posthog`, `sentry`); `value` is the adapter's last successful result and
 * `fetchedAt` drives the admin dashboard's TTL ("updated Nm ago") + the refresh
 * button. DB-derived metrics are NOT cached here (they're computed per request);
 * only the slow, rate-limited vendor API reads are. Aggregate operator data only,
 * never participant rows (ADR-0014).
 */
export const adminMetricSnapshot = pgTable("admin_metric_snapshot", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminMetricSnapshot = typeof adminMetricSnapshot.$inferSelect;

/**
 * Engagement-email settings (EE3 / ADR-0081). A single global row (one operator
 * config, not per-workspace) — `id` is pinned to "singleton" via a CHECK so there
 * is only ever one. Holds the per-feature kill switches (both DEFAULT FALSE — the
 * features ship ready but OFF), the schedule, and the editable subject/intro copy.
 * Edited only via adminProcedure.
 */
export const emailSettings = pgTable(
  "email_settings",
  {
    id: text("id").primaryKey().default("singleton"),
    /** Weekly workspace-activity digest. */
    digestEnabled: boolean("digest_enabled").notNull().default(false),
    /** 0=Sunday … 6=Saturday (UTC) + hour 0–23 (UTC). */
    digestDayOfWeek: integer("digest_day_of_week").notNull().default(1),
    digestHourUtc: integer("digest_hour_utc").notNull().default(9),
    digestSubject: text("digest_subject").notNull().default("Your weekly research digest"),
    digestIntroMd: text("digest_intro_md")
      .notNull()
      .default("Here's what happened across your workspaces this week."),
    /** Return-nudge for dormant researchers. */
    nudgeEnabled: boolean("nudge_enabled").notNull().default(false),
    /** Dormancy window: inactive at least N days, but not longer than N+window. */
    nudgeDormantDays: integer("nudge_dormant_days").notNull().default(14),
    nudgeWindowDays: integer("nudge_window_days").notNull().default(46),
    /** Don't nudge the same person more than once per N days. */
    nudgeCooldownDays: integer("nudge_cooldown_days").notNull().default(60),
    nudgeSubject: text("nudge_subject").notNull().default("Pick up where you left off"),
    nudgeIntroMd: text("nudge_intro_md")
      .notNull()
      .default("It's been a little while — your studies are right where you left them."),
    updatedByUserId: uuid("updated_by_user_id").references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("email_settings_singleton", sql`${t.id} = 'singleton'`)],
);

export type EmailSettings = typeof emailSettings.$inferSelect;
