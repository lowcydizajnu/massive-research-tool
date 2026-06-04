# Code tab handoff — V1.7.1 polish PR

V1.7.0 is shipped to production (`https://myresearchlab.app`). Owner's first real session surfaced one concrete UX gap + several known carry-forwards from the deploy audit ([`2026-06-04-v170-production-deploy.md`](../../06_qa/audit-logs/2026-06-04-v170-production-deploy.md)). This handoff bundles them into a V1.7.1 polish PR — small, focused, no new ADRs.

## Scope (4 items; one PR titled `V1.7.1 polish — loading spinners + CI gate fix + version history`)

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

### 4. `npm run deploy:verify` smoke against production

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
