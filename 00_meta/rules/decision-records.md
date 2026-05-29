# Decision records

A decision record (ADR — Architecture Decision Record, generalized here to any meaningful decision) captures *why* something was decided, not just what was decided. The "what" is in the code or the artifact; the "why" is irrecoverable without an ADR.

## When to write one

Write an ADR when any of these are true:

- You chose between two or more plausible options and someone could later disagree.
- You picked a library, service, or pattern that touches more than one feature.
- You changed a previously-recorded decision (the new ADR supersedes the old).
- You made a non-obvious trade-off where the cheap path was wrong.
- The data model changed in a way that affects existing data.
- A future contributor would reasonably ask "why this way?"

You do **not** need an ADR for routine, reversible, local choices. "I named this variable `participantId` instead of `userId`" is not an ADR. "We standardized on `participantId` across the codebase because of [reasons]" is.

## How to write one

Use `00_meta/templates/ADR-template.md`. Save it to `04_architecture/adrs/{NNNN}-{slug}.md` where `NNNN` is a zero-padded sequential number (`0001`, `0002`, …).

Every ADR has:

1. **Title and status.** Status is one of: `proposed`, `accepted`, `superseded by NNNN`, `deprecated`.
2. **Context.** What forced this decision. The problem, the constraints, the relevant prior decisions.
3. **Options considered.** At least two. For each: short description, pros, cons.
4. **Decision.** The choice, stated plainly.
5. **Consequences.** What gets easier, what gets harder, what becomes possible, what becomes off-limits.
6. **Triggers to revisit.** What would make us change our minds.

## How to retire one

Never delete an ADR. To replace a decision, write a new ADR that supersedes it, and change the old ADR's status to `superseded by NNNN`. The decision graph remains traceable.

## Decisions outside architecture

The same discipline applies to research and product decisions, kept in their own subfolders:

- Research decisions: `01_research/decisions/`
- Product decisions: inline in the persona/JTBD/flow they apply to, with a "Decision" heading
- Design decisions: inline in the relevant artifact (wireframe, design-system component), with a "Decision" heading

Use the ADR template even outside `04_architecture/adrs/` — the structure is what matters.

## What good looks like

> **0007 — Use Drizzle ORM instead of Prisma**
>
> *Accepted, 2026-06-12*
>
> **Context.** We need a typed query layer for Postgres. Prisma is the default in this ecosystem; Drizzle is the most viable alternative.
>
> **Options.**
> - **Prisma.** Mature, good DX, large community. Generates types from schema. Migrations are good. Performance overhead in some query patterns; harder to drop to raw SQL.
> - **Drizzle.** SQL-transparent, no codegen step, smaller bundle, type-safe. Younger ecosystem; some edge cases require workaround.
>
> **Decision.** Drizzle. The SQL transparency matters for a data-heavy app where we will need to write nontrivial queries; the small bundle matters at the edge.
>
> **Consequences.** Migrations live with the code (Drizzle Kit). Some Prisma-only tutorials will not apply. New contributors will need a short intro to Drizzle patterns.
>
> **Revisit if.** Drizzle's maintenance pace slows materially, or we find ourselves writing the same boilerplate that Prisma generates.

That is enough. ADRs are short on purpose.
