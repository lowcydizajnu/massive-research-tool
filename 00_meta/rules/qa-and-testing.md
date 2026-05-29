# QA and testing rules

A test suite is a safety net for changing code without breaking it. The goal is not coverage as a number; the goal is *the right tests in the right places* so refactors are safe and regressions are caught.

## The testing pyramid (for this product)

```
                  ▲
                  │  Manual exploratory  (rare, recorded in 06_qa/audit-logs/)
                  │
              End-to-end (Playwright)  — critical flows only, slow but realistic
              │
        Integration  — services + DB, in-memory or test container
        │
   Component / Storybook  — design system, visual regression
   │
Unit (Vitest)  — pure functions, validators, scoring, reducers
```

Most tests are at the bottom. Each layer up has fewer tests, costs more per test, but catches a wider class of bug.

## What must be tested

- **All pure domain logic.** Scoring, validation, graph evaluation, randomization. 100% of branches.
- **Every tRPC procedure.** At least one happy-path test and one auth-failure test.
- **Every state machine (XState).** Model-based testing via `@xstate/test` is ideal.
- **Every design-system component.** Storybook story + axe-core accessibility check + visual regression snapshot.
- **Every critical user flow.** Defined in `02_product/user-flows/` and labeled "critical." Playwright end-to-end test.
- **Every migration.** A migration test that runs forward and rollback against a copy of the prior schema.

## What does not need a test

- Trivial render-only components with no logic.
- Generated code (Drizzle types, OpenAPI clients).
- Throwaway scripts and one-off migrations beyond their migration test.

## Test discipline

- **Tests run before commit.** Use a pre-commit hook (Husky + lint-staged) so broken tests do not enter the repo.
- **Tests are deterministic.** No reliance on real time, real network, real randomness. Inject clocks, mock fetches, seed RNGs.
- **One assertion per test, ideally.** When that is unnatural, group with `describe`/`it` so failures point to the exact thing that broke.
- **Tests describe behavior, not implementation.** A test that breaks when you rename a private function is a brittle test.
- **No skipped tests in main.** A skipped test is a hidden failure. If a test must be skipped, link the ticket that will unskip it.

## The QA pass (Phase 6)

Before any feature is considered shipped, log a QA pass in `06_qa/audit-logs/{YYYY-MM-DD-feature-slug}.md` with:

- Feature spec link.
- Test results (unit, integration, e2e — all green).
- Accessibility scan result.
- Performance check on the longest expected workload.
- Security review if the change touches auth, data isolation, or external input.
- Manual exploratory test notes — what you tried, what surprised you, what you decided to ship despite.
- Sign-off: a one-line statement that you have read the above and accept the risk profile.

## Anti-patterns

- **Mocking the database in integration tests.** Use a real Postgres (testcontainers or a dedicated test schema). Mocks pass when the schema breaks.
- **Snapshot tests for everything.** Snapshots are useful for stable UI; they are noise for logic. Use them sparingly.
- **Testing the framework.** Don't test that React rerenders or that Drizzle inserts rows. Test your code.
- **Coverage as a target.** 100% coverage of trivial code while critical paths are untested is the worst of both worlds.
