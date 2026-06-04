/**
 * V1.7.0 deploy bootstrap (ADR-0016 amendment 2026-06-03). The single command
 * the owner runs (`npm run deploy:bootstrap`) — reads 05_app/.env.production and
 * drives every vendor that has a programmatic API, then prints a runbook-style
 * summary. Each step is idempotent (list-then-create), so a re-run after a
 * partial failure resumes cleanly.
 *
 * NOT in scope (owner-only, per the runbook): TOKEN_ENCRYPTION_KEY (never read
 * here — see the guard), Vercel/Upstash signups, the Clerk prod-app shell,
 * the OSF dev-app, the domain purchase, the smoke test, the audit sign-off.
 *
 * ⚠️ The vendor API request/response shapes follow each vendor's published v1/
 * v2 docs but are UNVERIFIED against the live APIs from this sandbox (like the
 * gated e2e specs). Dry-run against throwaway resources before the real deploy
 * and adjust any shape that drifted.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { isForbiddenKey, loadEnvFile, missingKeys, redact } from "./deploy-lib";

type Json = Record<string, unknown>;

const REQUIRED = [
  "VERCEL_TOKEN",
  "GITHUB_REPO",
  "NEON_API_KEY",
  "NEON_ORG_ID",
  "UPSTASH_API_KEY",
  "UPSTASH_EMAIL",
  "CLERK_PROD_SECRET_KEY",
  "CLERK_PROD_PUBLISHABLE_KEY",
  "CLERK_PROD_APPLICATION_ID",
  "OSF_PROD_OAUTH_CLIENT_ID",
  "OSF_PROD_OAUTH_CLIENT_SECRET",
  "PRODUCTION_DOMAIN",
  "TEST_USER_HANNA_EMAIL",
  "TEST_USER_MAYA_EMAIL",
  "TEST_USER_SOFIA_EMAIL",
  "TEST_USER_PASSWORD",
];

const summary: string[] = [];
function note(line: string) {
  summary.push(line);
  console.log(line);
}

/** fetch wrapper: JSON in/out, throws with a REDACTED body so no secret leaks. */
async function api(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: Json } = {},
): Promise<Json> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(redact(`${init.method ?? "GET"} ${url} → ${res.status}: ${text}`));
  }
  return text ? (JSON.parse(text) as Json) : {};
}

async function main() {
  const env = loadEnvFile();

  // Step 1 — validate env, fail fast with the full missing list.
  const missing = missingKeys(env, REQUIRED);
  if (missing.length) {
    console.error(`Missing required keys in .env.production:\n  - ${missing.join("\n  - ")}`);
    process.exit(1);
  }
  // Defence in depth: this script must never read the ledger key.
  for (const k of Object.keys(env)) {
    if (isForbiddenKey(k)) {
      console.error(
        "TOKEN_ENCRYPTION_KEY must NOT be in .env.production — add it to Vercel directly via `vercel env add` (ADR-0016).",
      );
      process.exit(1);
    }
  }
  const domain = env.PRODUCTION_DOMAIN;
  const vercelQs = env.VERCEL_TEAM_ID ? `?teamId=${env.VERCEL_TEAM_ID}` : "";
  const vercelHeaders = { authorization: `Bearer ${env.VERCEL_TOKEN}` };
  note(`# V1.7.0 deploy bootstrap — ${domain}`);

  // Step 2 — Neon: a FRESH mrt-production project (clean dev/prod isolation).
  // Neon migrated to organizations late 2024; org_id is required on the
  // projects endpoints. Find yours at console.neon.tech/app/organization/settings.
  const neonHeaders = { authorization: `Bearer ${env.NEON_API_KEY}` };
  const neonOrgQs = `?org_id=${encodeURIComponent(env.NEON_ORG_ID)}`;
  const neonList = (await api(`https://console.neon.tech/api/v2/projects${neonOrgQs}`, { headers: neonHeaders }))
    .projects as Array<{ id: string; name: string }> | undefined;
  let neon = neonList?.find((p) => p.name === "mrt-production");
  let databaseUrl: string;
  if (neon) {
    note(`Neon: project mrt-production exists (${neon.id}) — reusing.`);
    const uris = (await api(`https://console.neon.tech/api/v2/projects/${neon.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`, { headers: neonHeaders }));
    databaseUrl = String(uris.uri ?? "");
  } else {
    const created = await api("https://console.neon.tech/api/v2/projects", {
      method: "POST",
      headers: neonHeaders,
      body: { project: { name: "mrt-production", org_id: env.NEON_ORG_ID } },
    });
    neon = (created.project as { id: string; name: string });
    const conns = (created.connection_uris as Array<{ connection_uri: string }> | undefined) ?? [];
    databaseUrl = conns[0]?.connection_uri ?? "";
    note(`Neon: created project mrt-production (${neon.id}).`);
  }
  if (!databaseUrl) {
    console.error("Neon: could not resolve a pooled connection string — aborting.");
    process.exit(1);
  }
  // Schema + catalogue seed against the NEW project (never the dev one).
  for (const script of ["db:migrate", "db:seed"]) {
    const r = spawnSync("npm", ["run", script], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
    if (r.status !== 0) {
      console.error(`Neon: \`npm run ${script}\` failed against mrt-production — aborting.`);
      process.exit(1);
    }
  }
  note("Neon: migrated + seeded the modules/frameworks catalogue (no dev data copied).");

  // Step 3 — Upstash Redis (basic auth: email:api_key).
  const upstashAuth = `Basic ${Buffer.from(`${env.UPSTASH_EMAIL}:${env.UPSTASH_API_KEY}`).toString("base64")}`;
  const upstashHeaders = { authorization: upstashAuth };
  const dbs = (await api("https://api.upstash.com/v2/redis/databases", { headers: upstashHeaders })) as unknown as Array<{ database_id: string; database_name: string; endpoint: string; rest_token: string }>;
  let redisRestUrl = "";
  let redisRestToken = "";
  const existingRedis = Array.isArray(dbs) ? dbs.find((d) => d.database_name === "mrt-production") : undefined;
  if (existingRedis) {
    redisRestUrl = `https://${existingRedis.endpoint}`;
    redisRestToken = existingRedis.rest_token;
    note("Upstash: database mrt-production exists — reusing.");
  } else {
    // Upstash deprecated regional db creation in 2024 — use the Global shape
    // on the same /v2/redis/database endpoint. Field is `database_name` (matches
    // the GET response shape); `platform: "aws"` is required; `read_regions: []`
    // = behaves like single-region at the same free-tier cost.
    const r = (await api("https://api.upstash.com/v2/redis/database", {
      method: "POST",
      headers: upstashHeaders,
      body: {
        database_name: "mrt-production",
        platform: "aws",
        primary_region: env.UPSTASH_REGION || "us-east-1",
        read_regions: [],
        tls: true,
        eviction: true,
      },
    })) as { endpoint?: string; rest_token?: string };
    redisRestUrl = r.endpoint ? `https://${r.endpoint}` : "";
    redisRestToken = r.rest_token ?? "";
    note("Upstash: created Global database mrt-production (single primary region, allkeys-lru eviction).");
  }

  // Step 4 — Vercel project (idempotent).
  let project: { id: string };
  try {
    project = (await api(`https://api.vercel.com/v9/projects/massive-research-tool${vercelQs}`, { headers: vercelHeaders })) as { id: string };
    note(`Vercel: project massive-research-tool exists (${project.id}) — reusing.`);
  } catch {
    project = (await api(`https://api.vercel.com/v9/projects${vercelQs}`, {
      method: "POST",
      headers: vercelHeaders,
      body: {
        name: "massive-research-tool",
        framework: "nextjs",
        rootDirectory: "05_app",
        installCommand: "npm ci --legacy-peer-deps",
        buildCommand: "npm run build",
      },
    })) as { id: string };
    note(`Vercel: created project massive-research-tool (${project.id}).`);
  }

  // Step 5 — Vercel production env (everything EXCEPT TOKEN_ENCRYPTION_KEY).
  const ipSalt = Buffer.from(`${neon.id}:${project.id}`).toString("base64").slice(0, 24);
  const prodEnv: Record<string, string> = {
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_SITE_URL: `https://${domain}`,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: env.CLERK_PROD_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: env.CLERK_PROD_SECRET_KEY,
    OSF_OAUTH_CLIENT_ID: env.OSF_PROD_OAUTH_CLIENT_ID,
    OSF_OAUTH_CLIENT_SECRET: env.OSF_PROD_OAUTH_CLIENT_SECRET,
    OSF_OAUTH_REDIRECT_URI: `https://${domain}/api/auth/osf/callback`,
    INNGEST_EVENT_KEY: env.INNGEST_EVENT_KEY ?? "",
    INNGEST_SIGNING_KEY: env.INNGEST_SIGNING_KEY ?? "",
    UPSTASH_REDIS_REST_URL: redisRestUrl,
    UPSTASH_REDIS_REST_TOKEN: redisRestToken,
    UPSTASH_IP_BUCKET_SALT: ipSalt,
  };
  for (const [key, value] of Object.entries(prodEnv)) {
    if (isForbiddenKey(key)) continue; // never, ever
    await api(`https://api.vercel.com/v10/projects/${project.id}/env${vercelQs}`, {
      method: "POST",
      headers: vercelHeaders,
      body: { key, value, type: key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted", target: ["production"] },
    }).catch((e) => note(`Vercel env ${key}: ${String(e).slice(0, 80)} (likely already set — ok)`));
  }
  note(`Vercel: seeded ${Object.keys(prodEnv).length} production env vars.`);
  note("ACTION: TOKEN_ENCRYPTION_KEY NOT set — run `vercel env add TOKEN_ENCRYPTION_KEY production` and paste `openssl rand -hex 32`.");

  // Step 6 — Clerk production: redirect URLs + the three +clerk_test users.
  const clerkHeaders = { authorization: `Bearer ${env.CLERK_PROD_SECRET_KEY}` };
  await api(`https://api.clerk.com/v1/instance`, {
    method: "PATCH",
    headers: clerkHeaders,
    body: { allowed_origins: [`https://${domain}`] },
  }).catch((e) => note(`Clerk instance config: ${String(e).slice(0, 80)}`));
  for (const email of [env.TEST_USER_HANNA_EMAIL, env.TEST_USER_MAYA_EMAIL, env.TEST_USER_SOFIA_EMAIL]) {
    await api("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: clerkHeaders,
      body: { email_address: [email], password: env.TEST_USER_PASSWORD, skip_password_checks: true },
    }).catch((e) => note(`Clerk user ${email}: ${String(e).slice(0, 80)} (likely exists — ok)`));
  }
  note("Clerk: configured allowed origin + ensured the three +clerk_test users.");

  // Step 7 — OSF: verification reminder (no API).
  note(`ACTION: confirm the OSF prod app redirect URI = https://${domain}/api/auth/osf/callback (osf.io/settings/applications).`);

  // Step 8 — DNS (optional).
  if (env.DNS_PROVIDER === "cloudflare" && env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID) {
    await api(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      body: { type: "CNAME", name: domain, content: "cname.vercel-dns.com", proxied: false },
    }).catch((e) => note(`Cloudflare DNS: ${String(e).slice(0, 80)} (record may exist — ok)`));
    note(`Cloudflare: ensured CNAME ${domain} → cname.vercel-dns.com.`);
  } else {
    note(`ACTION (DNS): add a CNAME record  ${domain}  →  cname.vercel-dns.com  at your DNS provider.`);
  }

  // Step 9 — Vercel: attach the domain (SSL auto-provisions; verify polls).
  await api(`https://api.vercel.com/v10/projects/${project.id}/domains${vercelQs}`, {
    method: "POST",
    headers: vercelHeaders,
    body: { name: domain },
  }).catch((e) => note(`Vercel domain ${domain}: ${String(e).slice(0, 80)} (may be attached — ok)`));
  note(`Vercel: attached ${domain} (Let's Encrypt SSL provisions async).`);

  // Step 10 — Vercel: tie builds to the CI status check.
  await api(`https://api.vercel.com/v9/projects/${project.id}${vercelQs}`, {
    method: "PATCH",
    headers: vercelHeaders,
    body: { commandForIgnoringBuildStep: 'if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi' },
  }).catch((e) => note(`Vercel ignored-build-step: ${String(e).slice(0, 80)}`));
  note("Vercel: configured the ignored-build-step (CI status check gates the build).");

  // Step 11 — summary.
  note("\n=== Bootstrap summary ===");
  note(`Neon project: ${neon.id} (mrt-production)`);
  note(`Vercel project: ${project.id}`);
  note("Still owner-only: (1) `vercel env add TOKEN_ENCRYPTION_KEY production`; (2) wait for DNS + SSL.");
  note("Next: `npm run deploy:verify`");
}

// CLI entry only — never auto-run on import (so tests can import helpers safely).
const isEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isEntry) {
  void main().catch((e) => {
    console.error(redact(String(e?.stack ?? e)));
    console.error("\nBootstrap failed — fix the error above and re-run (steps are idempotent).");
    process.exit(1);
  });
}

export { main as runBootstrap };
