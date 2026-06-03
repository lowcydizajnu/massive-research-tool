/**
 * Standalone reseed of the three +clerk_test users in the PRODUCTION Clerk
 * instance (ADR-0016). The bootstrap already creates them; this is a separate
 * idempotent entry for when you need to re-run just that (e.g. you rotated the
 * shared test password). `npm run deploy:test-users`.
 *
 * Uses the Clerk Backend API + the `+clerk_test` email convention (which
 * bypasses email verification for testing).
 */
import { pathToFileURL } from "node:url";

import { loadEnvFile, missingKeys, redact } from "./deploy-lib";

async function main() {
  const env = loadEnvFile();
  const required = [
    "CLERK_PROD_SECRET_KEY",
    "TEST_USER_HANNA_EMAIL",
    "TEST_USER_MAYA_EMAIL",
    "TEST_USER_SOFIA_EMAIL",
    "TEST_USER_PASSWORD",
  ];
  const missing = missingKeys(env, required);
  if (missing.length) {
    console.error(`Missing keys: ${missing.join(", ")}`);
    process.exit(1);
  }

  const headers = {
    authorization: `Bearer ${env.CLERK_PROD_SECRET_KEY}`,
    "content-type": "application/json",
  };
  const emails = [env.TEST_USER_HANNA_EMAIL, env.TEST_USER_MAYA_EMAIL, env.TEST_USER_SOFIA_EMAIL];
  for (const email of emails) {
    const res = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email_address: [email],
        password: env.TEST_USER_PASSWORD,
        skip_password_checks: true,
      }),
    });
    if (res.ok) {
      console.log(`  ✓ ensured ${email}`);
    } else {
      const text = redact(await res.text());
      // A duplicate (already exists) is fine for an idempotent reseed.
      console.log(`  • ${email}: ${res.status} ${text.slice(0, 80)} (likely already exists — ok)`);
    }
  }
  console.log("Done.");
}

const isEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isEntry) {
  void main().catch((e) => {
    console.error(redact(String(e)));
    process.exit(1);
  });
}

export { main as seedClerkTestUsers };
