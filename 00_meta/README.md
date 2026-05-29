# 00_meta — how we work

Everything in this folder is about *the way we operate*, not about the product itself.

```
rules/         The standing rules — Claude reads these per task
templates/     The starting points for every kind of artifact we produce
```

## rules/

| File                  | What it governs                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| `architecture.md`     | System design rules, multi-tenancy, node-graph, what triggers an ADR   |
| `code-quality.md`     | Style, structure, error handling, validation, async, components        |
| `qa-and-testing.md`   | Testing pyramid, what must be tested, the Phase-6 QA pass              |
| `design-rules.md`     | How design decisions are made and gated, accessibility floor           |
| `research-rules.md`   | Evidence standards, replication, ethics, links to product effect       |
| `decision-records.md` | When to write an ADR, how, how to retire one                           |

## templates/

Copy a template into the right folder before starting any new artifact. Filename for the copy uses kebab-case and a short slug. Examples:

- New ADR → `04_architecture/adrs/0042-experiment-versioning.md`
- New user flow → `02_product/user-flows/run-an-experiment.md`
- New wireframe spec → `03_design/wireframes/experiment-builder-canvas.md`
- New feature spec → next to the wireframe or in `02_product/`, named after the feature
- New research protocol → `01_research/protocols/stroop-classic.md`
- New experiment spec → eventually under the project that owns it

Templates evolve. When a template no longer fits the work, update the template — do not work around it in individual files.
