/**
 * Migration test (QA rule: every migration runs forward + a rollback check,
 * deterministically — no real network/time/RNG).
 *
 * Runs against an in-process PGlite (Postgres compiled to WASM), so it is
 * hermetic. drizzle-kit emits no down-migrations, so the "rollback" leg here is
 * a teardown-and-reapply idempotency check (a fresh DB + re-applied migrations
 * must converge to the same schema, and re-running the migrator must be a
 * no-op). If we ever hand-author down SQL, add an explicit reverse leg.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = "./server/db/migrations";

let pg: PGlite;

async function applyMigrations() {
  const db = drizzle(pg);
  await migrate(db, { migrationsFolder: MIGRATIONS });
}

beforeEach(async () => {
  pg = new PGlite();
});

afterEach(async () => {
  await pg.close();
});

describe("first migration — forward apply", () => {
  it("creates every table", async () => {
    await applyMigrations();
    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of [
      "user",
      "workspace",
      "member",
      "experiment",
      "experiment_version",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("creates every enum type", async () => {
    await applyMigrations();
    const { rows } = await pg.query<{ typname: string }>(
      `select typname from pg_type where typtype = 'e'`,
    );
    const enums = rows.map((r) => r.typname);
    for (const e of [
      "member_role",
      "member_status",
      "forkable_by",
      "experiment_version_kind",
      "amendment_classification",
    ]) {
      expect(enums).toContain(e);
    }
  });

  it("creates the named CHECK constraints", async () => {
    await applyMigrations();
    const { rows } = await pg.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c'`,
    );
    const checks = rows.map((r) => r.conname);
    expect(checks).toContain("experiment_version_name_required");
    expect(checks).toContain("experiment_version_amendment_consistency");
    expect(checks).toContain("experiment_fork_consistency");
    expect(checks).toContain("member_status_user_consistency");
  });
});

describe("constraints reject invalid rows", () => {
  // Build the minimal valid parent graph the FKs require.
  async function seedUserWorkspaceExperiment() {
    const u = await pg.query<{ id: string }>(
      `insert into "user" (external_id, email) values ('ext_1', 'a@example.com') returning id`,
    );
    const userId = u.rows[0].id;
    const w = await pg.query<{ id: string }>(
      `insert into workspace (name, slug, owner_id) values ('Lab', 'lab', $1) returning id`,
      [userId],
    );
    const workspaceId = w.rows[0].id;
    const e = await pg.query<{ id: string }>(
      `insert into experiment (tenant_id, owner_id, title) values ($1, $2, 'Study') returning id`,
      [workspaceId, userId],
    );
    return { userId, workspaceId, experimentId: e.rows[0].id };
  }

  it("rejects a non-autosave version with no name", async () => {
    await applyMigrations();
    const { userId, experimentId } = await seedUserWorkspaceExperiment();
    await expect(
      pg.query(
        `insert into experiment_version
           (experiment_id, version_number, kind, definition_snapshot, module_version_locks, created_by)
         values ($1, 1, 'named', '{}'::jsonb, '[]'::jsonb, $2)`,
        [experimentId, userId],
      ),
    ).rejects.toThrow();
  });

  it("accepts an autosave version with no name", async () => {
    await applyMigrations();
    const { userId, experimentId } = await seedUserWorkspaceExperiment();
    await expect(
      pg.query(
        `insert into experiment_version
           (experiment_id, version_number, kind, definition_snapshot, module_version_locks, created_by)
         values ($1, 1, 'autosave', '{}'::jsonb, '[]'::jsonb, $2)`,
        [experimentId, userId],
      ),
    ).resolves.toBeTruthy();
  });

  it("rejects a half-set fork (parent set, version null)", async () => {
    await applyMigrations();
    const { userId, workspaceId, experimentId } =
      await seedUserWorkspaceExperiment();
    await expect(
      pg.query(
        `insert into experiment (tenant_id, owner_id, title, fork_of_experiment_id)
         values ($1, $2, 'Fork', $3)`,
        [workspaceId, userId, experimentId],
      ),
    ).rejects.toThrow();
  });

  it("rejects an amendment with an empty change_summary", async () => {
    await applyMigrations();
    const { userId, experimentId } = await seedUserWorkspaceExperiment();
    const base = await pg.query<{ id: string }>(
      `insert into experiment_version
         (experiment_id, version_number, kind, name, definition_snapshot, module_version_locks, created_by)
       values ($1, 1, 'preregistered', 'v1', '{}'::jsonb, '[]'::jsonb, $2) returning id`,
      [experimentId, userId],
    );
    await expect(
      pg.query(
        `insert into experiment_version
           (experiment_id, version_number, kind, name, definition_snapshot, module_version_locks, created_by, supersedes_version_id, change_summary)
         values ($1, 2, 'preregistered', 'v2', '{}'::jsonb, '[]'::jsonb, $2, $3, '   ')`,
        [experimentId, userId, base.rows[0].id],
      ),
    ).rejects.toThrow();
  });
});

describe("rollback check — teardown + reapply idempotency", () => {
  it("re-running the migrator is a no-op on an already-migrated db", async () => {
    await applyMigrations();
    // Second run must not throw and must not duplicate objects.
    await expect(applyMigrations()).resolves.not.toThrow();
    const { rows } = await pg.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'user'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("a fresh database re-applies to the identical table set", async () => {
    await applyMigrations();
    const first = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    await pg.close();
    pg = new PGlite();
    await applyMigrations();
    const second = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(second.rows.map((r) => r.table_name)).toEqual(
      first.rows.map((r) => r.table_name),
    );
  });
});
