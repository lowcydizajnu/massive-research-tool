# Code tab handoff — V1.7.1 polish PR

V1.7.0 is shipped to production (`https://myresearchlab.app`). Owner's first real session surfaced one concrete UX gap + several known carry-forwards from the deploy audit ([`2026-06-04-v170-production-deploy.md`](../../06_qa/audit-logs/2026-06-04-v170-production-deploy.md)). This handoff bundles them into a V1.7.1 polish PR — small, focused, no new ADRs.

## Scope (6 items; one PR titled `V1.7.1 polish — OAuth fix + versioning + spinners + CI + Versions tab`)

> **Two new items added 2026-06-04** after owner's first real session post-V1.7.0 ship surfaced: a Google OAuth sign-in dead-end loop (item 5) + a versioning model intuition gap (item 6 — owner is right; fixing).

### 1. Loading spinners on primary mutation buttons (highest priority — owner explicitly flagged)

**Owner-reported:** "saving, adding comments takes some time — sometimes too long — we should make it faster or add loading spinners at buttons." Either the operations are genuinely slow, the user doesn't know they're in-flight, or both. The buttons need an in-flight state that's unambiguous.

Pattern: every primary `useMutation()` call has an `isPending` state. Wire that into the button:

```tsx
<Button disabled={mutation.isPending}>
  {mutation.isPending && <Spinner className="mr-2 h-4 w-4 animate-spin" />}
  {mutation.isPending ? "Saving…" : "Save"}
</Button>
```

Audit + apply to:

- **Save dialog** — `studies.saveAsNamed`, `studies.publish`
- **Comment composer** — `comments.create`, `comments.update`, `comments.delete`, `comments.resolve`
- **Add block / remove block** — `studies.addBlock`, `studies.removeBlock` (these are usually quick but the visual feedback closes the loop)
- **Preregister** — `studies.preregister` (already shows a status banner but the button itself should disable + spin)
- **Retry push** — `studies.retryPush`
- **Open recruitment** — `studies.openRecruitment`
- **Connect OSF / Disconnect OSF** — Account · Connections page
- **+Follow / Unfollow** — every tag chip + author byline + Framework + study Details surface (these are tRPC mutations; the button should at minimum debounce + reflect state)
- **Save & request review** — already a dialog; the submit button needs the same treatment
- **Conditions CRUD** (Builder Conditions section) — Add/Update/Remove condition buttons

For shared button consistency: extract a `<PendingButton>` or `<SubmitButton>` primitive in `components/ui/` that takes `pending: boolean` + `idleLabel` + `pendingLabel` + a built-in `<Spinner />`. Apply across the audit. Reduces drift.

Also add toast feedback for completed mutations where appropriate (Save → "Saved as v4", Comment → "Comment posted") — owner gets a positive confirmation in addition to the spinner disappearing.

Test additions: at least one Playwright spec asserting that clicking Save shows the disabled+pending state, then the success state, then the dialog closes. Pattern can be reused across the other mutation surfaces.

### 2. Wire the CI gate properly (ADR-0016 carry-forward)

Current state (per the deploy audit §"Carried forward"): `commandForIgnoringBuildStep` is set to `if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi` — which gates by branch, not by GitHub Actions status. CI failures on main don't block the deploy; preview deploys are disabled.

Fix:

- Remove the branch-only ignored-build-step.
- Wire Vercel's GitHub integration to wait on the GitHub Actions status check from `.github/workflows/ci.yml`. The simplest path is to use Vercel's project setting **Git → Production Branch Validation** or equivalent — checks must pass before Production deploys.
- Restore preview deploys: any PR branch builds a preview; the GitHub Actions check on that PR gates whether the preview becomes accessible.

Update `04_architecture/adrs/0016-production-deployment-architecture.md` with an amendment note that this was fixed in V1.7.1.

### 3. Version-history sub-tab in Builder (owner-noted clarity item)

Owner asked: "why does it always say version 3?" The answer is "version counter is shared across autosave + named + preregister + publish, so v3 = 3rd version of this experiment in any kind." But the answer isn't surfaced in the UI — only the latest preregistered version shows, with no visibility into v1 or v2.

Fix: add a **Versions** sub-tab to the Builder right-panel (alongside Details / Configure / Conditions / Replications). It lists every `ExperimentVersion` row for the current experiment, oldest-to-newest:

```
v1 — autosave (working tip) — last edited 2 min ago
v2 — published "Pilot 1" (frozen, immutable) — 2026-06-04
v3 — preregistered (frozen, immutable, submitted to OSF) — 2026-06-04 — DOI pending
```

Each row links to either the live editing surface (autosave) or the read-only frozen snapshot view. Resolves the "v3 mystery" + provides the version-history affordance per ADR-0002.

### 5. Fix Google OAuth sign-in dead-end (owner-reported, 2026-06-04)

**Owner reproduced:** "I can go through Google sign-in but at the end I end up at login screen again — no error, nothing." This happens because:

- The only OAuth callback route is `app/(auth)/signup/sso-callback/page.tsx`. Both sign-IN (`/signin` page line 67 → `redirectUrl: "/signup/sso-callback"`) and sign-UP (`/signup` page → same callback) point at it.
- That callback runs `handleRedirectCallback({ continueSignUpUrl: "/signup" })`. When Clerk decides the OAuth identity needs to "continue signup" (because the user signed up earlier via email magic-link with a Clerk identity that isn't linked to their Google identity, OR Google OAuth consent is in Testing mode and returns insufficient identity), it routes to `/signup`.
- `/signup` is now the post-commit-`5fcda09` redirect target for unauth visits to `/` — so any user not already in a Clerk session ends up at the signup form. Loop closed.

Three fixes (do all):

**5a. Create a dedicated sign-IN callback route** at `app/(auth)/sso-callback/page.tsx` that uses `handleRedirectCallback` with NO `continueSignUpUrl` (so an existing-session OAuth completion goes to the original `redirectUrlComplete` = `/studies` and doesn't bounce). Update the sign-in page's `redirectUrl` from `"/signup/sso-callback"` to `"/sso-callback"`.

**5b. Enable identity linking** so signing in via Google with the same email as an existing magic-link user merges the identities rather than creating a separate Clerk user. In Clerk Dashboard → User & Authentication → "Identity verification" (or wherever account-linking lives in the current Clerk UI) → enable "Use email as a verified factor for existing accounts." Document the dashboard step in `04_architecture/handoffs/` so future deploys remember it.

**5c. Diagnostic shim:** in the sign-up callback (`/signup/sso-callback`), if `handleRedirectCallback` decides "continue signup" but the user's email already exists on a different Clerk user, surface a clear error ("This email is already registered — use email magic-link, or sign in with the matching method") instead of silently bouncing to `/signup`. The error gets logged to Vercel + shown to user.

Test additions: a Playwright spec in the gated `auth` project that signs in via Google with an existing test user → asserts landing on `/studies`, not `/signin`.

### 6. Rework versioning so autosave is "Draft" not v1 (owner-reported, 2026-06-04)

**Owner-reported:** "versioning should be conscious user decision not automatically like now, it is easy to end up with something like v425 with autosave."

Owner's intuition is right + the current behavior is mildly worse than the design implies. The code bumps `versionNumber = max+1` across ALL kinds (autosave + named + preregistered + published). So v1 is the autosave (mutable working tip, never gets a "name"), and v2+ are conscious saves. Owner's first Preregister was v3 because she had v1 autosave + v2 (likely from her earlier stuck-pending preregister retry) + v3 current.

**The fix — version_number bumps only on conscious save actions (named / preregistered / published); autosave stays unnumbered.**

Code change in `server/trpc/routers/studies.ts` — currently 3 sites do `(latest?.n ?? 0) + 1`:
- Line ~840 in `saveAsNamed`
- Line ~935 in `publish`
- Line ~1007 in `preregister`

Replace each with a `count()` over conscious kinds only:

```ts
import { count, inArray } from "drizzle-orm";

const [counted] = await ctx.db
  .select({ c: count() })
  .from(experimentVersion)
  .where(and(
    eq(experimentVersion.experimentId, exp.id),
    inArray(experimentVersion.kind, ["named", "preregistered", "published"]),
  ));
const nextNumber = (counted?.c ?? 0) + 1;
```

Autosave initialization (lines ~1503, ~1550 in `studies.create` + the fork path) should set `versionNumber: 0` (or null — pick one; 0 is simpler and matches "before v1" semantics) instead of 1.

UI labels in the Versions sub-tab (item 3 of this PR) + the Preregister/Publish/Save dialogs:
- Autosave row: **"Draft"** (no number)
- Named: **"v1 — {name}"**, **"v2 — {name}"**, …
- Preregistered: **"Preregistration v1"**, **"v2"**, …
- Published: **"Published v1"**, **"v2"**, …

ADR-0012 amendment: append a "2026-06-04 amendment — versionNumber semantics" section recording: autosave's `versionNumber` is 0 (or null), bumping starts at 1 with the first conscious snapshot, count-not-max protects against accidental skips if a snapshot is ever deleted (none currently are, but the semantics are cleaner).

Migration: existing production data (the few studies owner has created) has v1 = autosave with versionNumber=1, v2/v3 = preregister/publish/named with versionNumber=2,3. After this change, EXISTING rows keep their numbers (we don't backfill) but NEW studies start cleanly. Add a one-paragraph note to the V1.7.1 audit log about the inconsistency for owner's existing studies (cosmetic; the version-history sub-tab labels each by kind so the gap isn't confusing).

Test additions: a unit test asserting that for a fresh study, `saveAsNamed` first → versionNumber=1; then preregister → versionNumber=2; autosave updates between never bump.

### 7. `npm run deploy:verify` smoke against production

Skipped this deploy turn (owner ran manual smoke instead). Document the procedure for next deploy (V1.7.1 ship) — run `deploy:verify` after the build is green; aggregate axe + e2e + smoke into a one-screen report.

If anything in the axe spec fails on production, fix the violations as part of this same V1.7.1 PR.

## What's NOT in scope (defer to V1.8+)

- Cross-workspace discovery surface (V1.7 anchor carry-forward) — that's V1.8 territory if owner picks it as the anchor; otherwise queued.
- Google OAuth "Publish app" step — owner-only, not Code-tab work.
- The 6 hotfixes that happened during the deploy (`8733b0f`, `7d93963`, `7417ca6`, `5fcda09`, etc.) — already merged.
- The bootstrap script's known rough edges (no Inngest environment selector, Clerk dashboard manual steps documented but not auto-skipped if pre-configured) — could improve in a future deploy-script PR, low priority since the next deploy is V1.7.1 onto an existing project.

## Reading order

1. [`06_qa/audit-logs/2026-06-04-v170-production-deploy.md`](../../06_qa/audit-logs/2026-06-04-v170-production-deploy.md) — what shipped + what owner hit
2. [`04_architecture/adrs/0016-production-deployment-architecture.md`](../adrs/0016-production-deployment-architecture.md) + 2026-06-03 amendment — the CI gate context
3. [`04_architecture/adrs/0002-forking-model.md`](../adrs/0002-forking-model.md) — version model (informs the Versions sub-tab UX)
4. [`05_app/server/trpc/routers/studies.ts`](../../05_app/server/trpc/routers/studies.ts) — `versionNumber` increments + mutation patterns (informs both the spinners audit + the Versions sub-tab data layer)

## Ship

When green: ping owner. Owner runs `npm run deploy:verify` against production after the V1.7.1 deploy; signs the audit log; tags `v1.7.1`.
