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
  check,
  integer,
  jsonb,
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

/* ---------- inferred types ---------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Experiment = typeof experiment.$inferSelect;
export type ExperimentVersion = typeof experimentVersion.$inferSelect;
