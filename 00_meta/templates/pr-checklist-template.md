# PR / commit-batch checklist

Copy into the PR description (or, when working solo on `main`, into the commit message of the merge or squash commit). Items marked **REQUIRED** are gates; the change does not land until they are checked.

## What this change does

One paragraph. Plain language.

## Traceability

- [ ] **REQUIRED** — Links to the feature spec in `00_meta/` or wherever it lives.
- [ ] **REQUIRED** — Links to the user flow it serves.
- [ ] **REQUIRED** — Links to relevant ADR(s), or notes "no architectural change."

## Phase-gate check

- [ ] No new architectural concept introduced without an ADR.
- [ ] No new component used that isn't in the design system.
- [ ] No data model change without a migration *and* a migration test.
- [ ] No new tRPC procedure without a happy-path and an auth-failure test.

## Code quality

- [ ] `pnpm typecheck` passes locally.
- [ ] `pnpm lint` passes locally.
- [ ] `pnpm test` passes locally.
- [ ] No new `// @ts-ignore` without an explanatory comment.
- [ ] No new dependency without a one-line justification in the PR.
- [ ] No commented-out code, no `console.log` left behind.

## Tests

- [ ] **REQUIRED** — Tests added or updated for every code path changed.
- [ ] Pure domain logic: unit tests, all branches covered.
- [ ] State machines: model-based tests cover state transitions.
- [ ] Design-system components: Storybook story + axe check.
- [ ] Critical flows: Playwright e2e updated or added.

## Design and accessibility (UI changes)

- [ ] Matches the handoff spec; deviations noted and justified.
- [ ] All states implemented (default, loading, empty, error, partial).
- [ ] Keyboard reachable, focus visible.
- [ ] axe-core check passes.
- [ ] `prefers-reduced-motion` respected.

## Data and security

- [ ] No cross-tenant data path introduced.
- [ ] All new inputs validated at the boundary (Zod).
- [ ] No secrets committed; new secrets added to the secret manager.
- [ ] If touching auth, data isolation, or external input: `security-review` skill run, findings addressed.

## Operational

- [ ] New environment variables added to `.env.example` and the deploy config.
- [ ] New background jobs registered, dashboards updated.
- [ ] Telemetry events added or updated to match the feature spec.
- [ ] Rollout plan: feature flag, percentage rollout, or behind staging.

## Risk and rollback

- [ ] Risk level: low | medium | high. One sentence on why.
- [ ] Rollback plan: how do we undo this if it goes badly.

## QA pass

- [ ] **REQUIRED** for medium/high-risk changes — a QA audit log entry in `06_qa/audit-logs/`.
