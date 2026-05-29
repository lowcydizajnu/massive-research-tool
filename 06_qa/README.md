# 06_qa — verification

The deliberate quality assurance layer that sits above unit and integration tests.

```
test-strategy.md   The overall plan — what we test, where, how
audit-logs/        One file per QA pass: what was tested, what was found
```

## Read first

- `../00_meta/rules/qa-and-testing.md`

## What a QA audit log looks like

One file per QA pass: `audit-logs/{YYYY-MM-DD}-{feature-slug}.md`. It records the state of the world at the time of the pass — not a moving document. If something changes after the audit, write a new audit, do not edit the old one.

Each log links the feature spec, lists test results, records accessibility/performance/security findings, and ends with a sign-off. The format is in `../00_meta/rules/qa-and-testing.md`.

## Cadence

Audits happen at three points:

1. **Feature complete.** Before merging the feature branch (or before squashing to main if solo).
2. **Release candidate.** Before deploying to production.
3. **Periodic regression sweeps.** Quarterly at first, more often if the surface area justifies it.
