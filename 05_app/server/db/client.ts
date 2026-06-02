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
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — see 05_app/.env.local");
}

const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle({ client: queryClient, schema });
export { schema };
