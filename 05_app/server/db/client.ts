/**
 * Database client — Drizzle over the postgres-js driver.
 *
 * Driver choice (per ADR-0011 + the data-model finalize note): postgres-js,
 * NOT drizzle-orm/neon-http. Onboarding writes user + workspace + member in a
 * single interactive transaction (`db.transaction(...)`), which the HTTP
 * driver cannot do. postgres-js over Neon's pooled connection string supports
 * it. `prepare: false` is the recommended setting behind a connection pooler.
 *
 * The connection string is the only Vercel/Neon-specific surface, and it is an
 * env var — moving to any other Postgres host is a config change, not a code
 * change (see 04_architecture/lock-in-inventory.md, Vercel row).
 *
 * LAZY INIT (2026-06-03, ADR-0016 deploy prep): the client is built on first
 * use behind a Proxy, NOT at import. `next build`'s "Collecting page data"
 * step imports every server module to read its exports; throwing at import
 * when `DATABASE_URL` is unset broke the build before any env was configured.
 * Deferring the connection (and the missing-env error) to the first query
 * keeps import side-effect-free while still failing loudly the moment a
 * request actually needs the database.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let instance: DB | null = null;

/** Build (once) and return the real Drizzle client. Throws clearly if unconfigured. */
function getDb(): DB {
  if (instance) return instance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see 05_app/.env.local");
  }
  const queryClient = postgres(connectionString, { prepare: false });
  instance = drizzle({ client: queryClient, schema });
  return instance;
}

/**
 * The app-wide client. A Proxy so importing this module is side-effect-free;
 * the connection + the missing-env check happen on the first property access
 * (e.g. `db.select(...)`). Methods are bound to the real instance so query
 * builders chain correctly.
 */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb() as object;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(real)
      : value;
  },
}) as DB;

export { schema };
