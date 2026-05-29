# Test strategy

The high-level plan. Detailed rules are in `../00_meta/rules/qa-and-testing.md`.

## Goals

1. **Refactors are safe.** Tests fail when behavior changes, not when implementation changes.
2. **Regressions are caught early and cheap.** The lower in the pyramid the catch, the cheaper it is.
3. **Critical flows are never broken silently.** End-to-end coverage on the flows the business depends on.
4. **The design system never drifts.** Visual and accessibility regressions are caught before they reach the app.

## Coverage targets (by criticality, not by line count)

| Layer                          | Target                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| Pure domain logic              | All branches; new branches require new tests                 |
| tRPC procedures                | Every procedure: happy path + auth failure + invalid input   |
| State machines (XState)        | Every transition; model-based tests                          |
| Design-system components       | Every component: story + axe + visual snapshot               |
| Critical user flows            | End-to-end test per flow, run on every PR                    |
| Migrations                     | Forward + rollback test against a copy of the prior schema   |
| Auth and tenancy boundaries    | Negative tests proving cross-tenant access is impossible     |

## Tooling

- **Vitest** — unit and integration.
- **Playwright** — end-to-end, runs against a deployed staging build.
- **Storybook + Chromatic (or Playwright visual)** — component stories with visual regression.
- **axe-core** — accessibility checks in component tests and in CI.
- **Testcontainers (Postgres)** — real DB for integration tests.

## CI gates

1. Type check.
2. Lint.
3. Unit + integration tests.
4. Build.
5. E2E tests (only on PR to `main` and on `main` itself; not on every push).
6. Visual regression check.
7. Accessibility scan.

Nothing merges with a failing gate.

## Non-goals

- 100% line coverage. We aim for *the right tests*, not the most tests.
- Testing third-party libraries. We trust them at their published behavior and pin versions.
- Snapshot tests as primary coverage. They are noise without intent.
