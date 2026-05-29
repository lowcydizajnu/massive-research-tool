# 02_product — who, what, why

Translates research and user reality into the things we will design and build.

```
personas/          Anchored in real evidence; one page each
jobs-to-be-done/   What users hire the product to do, in what context, for what outcome
user-flows/        The literal step sequence to accomplish a job
user-journeys/     The emotional arc and touchpoints across time
use-cases/         Explicit success and failure paths for the most critical flows
```

## Read first

- `../00_meta/templates/user-flow-template.md`
- `../00_meta/templates/user-journey-template.md`

## Ordering

A flow comes from a JTBD which comes from a persona which is anchored in research. Out of order, the artifacts disconnect from each other and the product loses coherence.

```
personas (research-grounded)
   └── jobs-to-be-done
          └── user-flows
                 ├── user-journeys (emotional layer over the flow)
                 └── use-cases (critical paths explicit)
```

## Personas for this product (starting set)

- **Principal Investigator (PI).** Designs experiments, owns the science, accountable for results. Time-poor, evidence-driven.
- **Research Assistant (RA).** Configures, runs, monitors, and exports. Hands-on, every-day user.
- **Participant.** Completes experiments. May be naive to the paradigm, varies wildly in motivation and device.
- **Collaborator / co-author.** Views, comments, sometimes edits. Less frequent user.
- **Org admin.** Manages access, billing, compliance. Rare user; high consequence when they act.

Each persona deserves its own file once we have evidence. Until then, they are placeholders.
