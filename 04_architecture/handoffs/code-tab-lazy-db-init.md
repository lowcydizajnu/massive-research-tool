# Code tab handoff — lazy-init the DB client (urgent; ~30 min)

## What happened

Owner attempted a Vercel deploy from commit `ab65760` (V1.7 close). Vercel build failed at "Collecting page data":

```
Error: DATABASE_URL is not set — see 05_app/.env.local
    at .next/server/chunks/3421.js:1:14378
    at .next/server/app/api/auth/osf/callback/route.js
```

`next build`'s "Collecting page data" phase imports every route to determine static-vs-dynamic. The OSF callback route imports the DB client module, which throws **at import time** if `DATABASE_URL` is missing. Vercel's build environment had no env vars set (owner connected the repo before pasting env vars; that's now being addressed via `04_architecture/vercel-fast-path-worksheet.md`).

## Why this is a real bug regardless of the env var fix

Module-level `throw` on missing env var is a footgun that will bite again any time:

- A preview deploy runs without the full env (Vercel preview branches use a separate scope).
- Someone runs `npm run build` with a stale or incomplete `.env.local`.
- A future cold start during a Vercel env-var rotate window catches the import mid-update.
- Static-analysis tooling (typecheck, lint, route discovery) tries to load route handlers.

The correct shape: env var check happens at **first query**, not at module load. Build-time route imports become safe; runtime correctly errors if someone actually tries to query without an env var set.

## What to do

### 1. Convert `server/db/client.ts` to lazy initialization

Currently:

```ts
// approximate shape — adjust to actual file
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see 05_app/.env.local");
const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
```

Change to:

```ts
let _client: postgres.Sql | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see 05_app/.env.local");
  _client = postgres(url, { prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

// Backwards-compatibility shim during the migration — DEPRECATED, remove
// once all callers are migrated. Lazy-throws on access.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
```

The Proxy shim means existing callers (`import { db } from "@/server/db/client"; db.select()…`) keep working without changes — the env check fires on first property access, not module load. This is what `auth.ts` does today for the AuthAdapter and matches the pattern.

### 2. Verify with a deliberately-broken build

```sh
cd 05_app
unset DATABASE_URL
npm run build
```

Should succeed. (It'll fail at runtime if anything tries to query, but `next build`'s page data collection won't trip it.)

Then `export DATABASE_URL=<real-value>; npm run build` — should succeed and the dev pipeline is unchanged.

### 3. Tests

Add a unit test in `server/db/__tests__/client.test.ts`:

```ts
it("import succeeds without DATABASE_URL", async () => {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    // Dynamic import to ensure module is re-evaluated under the missing env.
    const mod = await import("../client?nocache=" + Date.now());
    expect(mod.db).toBeDefined();  // no throw
  } finally {
    process.env.DATABASE_URL = originalUrl;
  }
});

it("first query throws clearly when DATABASE_URL is missing", async () => {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { getDb } = await import("../client?nocache=" + Date.now());
    expect(() => getDb()).toThrow(/DATABASE_URL/);
  } finally {
    process.env.DATABASE_URL = originalUrl;
  }
});
```

(The dynamic-import-with-cache-buster pattern is a vitest convention for re-evaluating a module per test.)

### 4. Same audit for other env-var-dependent modules

Grep for `process.env.` + `throw` at module top-level scope:

```sh
cd 05_app
grep -rn 'process\.env\.' server lib app | xargs grep -l 'throw' 2>/dev/null | head -20
```

Any module that throws at import is a candidate for the same lazy-init pattern. Likely suspects from prior work:

- `server/adapters/auth.clerk.ts` — Clerk uses `clerkClient()` which reads env at call time, probably fine, but double-check.
- `server/adapters/registry.osf.ts` — OSF config reads env; verify import is safe.
- `server/crypto/tokens.ts` — `TOKEN_ENCRYPTION_KEY` getter; same audit.
- `server/jobs/registry-push.ts` — Inngest client init; same audit.

Convert any that throw-at-import to lazy-throw-at-call. Add a brief test for each in the same shape.

### 5. Commit

`fix(db): lazy-init DB client so missing DATABASE_URL doesn't break build (post-deploy-attempt fix)`

In the commit body, link to the failed build log + this handoff + the owner's V1.7 fast-path worksheet so the why-this-fix-now context is captured.

## Out of scope (defer)

- The bigger V1.7.0 pre-deploy bundle (Upstash adapter + rate-limit calls + CI workflow + bootstrap script + verify script + axe spec) — still queued per `handoffs/code-tab-pre-deploy-v170.md`. Owner is taking the fast path to V1.7 first; the proper V1.7.0 path comes after owner has the appetite.
- Adding a global env-var validator at app startup (Zod-validated env object) — would be a nice refactor but doesn't block anything; queue for V1.8+.

## Reading order

1. The failed Vercel build log (in owner's message above; I have a copy if you need it).
2. `04_architecture/vercel-fast-path-worksheet.md` — owner's current path; understand the context.
3. `05_app/server/db/client.ts` — the file you're changing.
4. `05_app/server/adapters/auth.ts` — example of the Proxy-shim pattern you'll mirror.

## When done

Ping owner with: "Lazy-DB fix landed on commit `<sha>`. Future builds without `DATABASE_URL` won't trip page-data collection. The V1.7 fast-path deploy can proceed; the V1.7.0 proper-path handoff is unchanged."
