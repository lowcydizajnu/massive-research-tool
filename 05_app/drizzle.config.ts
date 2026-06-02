import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local at runtime; drizzle-kit (plain Node) does not, so
// load it here for db:generate / db:migrate.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
