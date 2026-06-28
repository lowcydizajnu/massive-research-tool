import { config } from "dotenv";

// Load .env.local before anything imports the DB client (plain Node run, not Next).
config({ path: ".env.local" });

async function main() {
  // Dynamic imports so dotenv runs before client.ts reads DATABASE_URL.
  const { seedCoreModules } = await import("./seed-core");
  await seedCoreModules();
  console.log("✓ core modules seeded");
  const { seedMisinfoStarter } = await import("./seed-misinfo-starter");
  await seedMisinfoStarter();
  console.log("✓ misinformation starter template seeded");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
