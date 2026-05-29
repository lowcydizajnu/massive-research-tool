# Architecture rules

These rules govern any decision that shapes the system. They exist because architectural mistakes are the most expensive class of bug — they cost weeks, not hours, to undo.

## Principles

**Model the domain, not the database.** Names of entities, fields, and operations come from how psychologists talk about their work: Experiment, Trial, Stimulus, Condition, Participant, Response, Block, Session. If a name only makes sense to engineers, it is wrong.

**Multi-tenancy is structural, not bolted on.** Every read and every write is scoped by tenant (Organization). There is no "global" query path that bypasses tenant scoping. Enforce this at the data layer (RLS or query helpers), not just at the application layer.

**Data flows in one direction.** Within a request: input → validation → application logic → repository → database. Within the app over time: research → product → design → architecture → code. Reversed flows (e.g., "we'll change the schema to fit the UI") are smells.

**Boundaries before features.** Every feature lives behind a clear interface (a tRPC router, a service, a module). The interface is designed first; the implementation is replaceable.

**Pure where possible, side-effects at the edges.** Domain logic (scoring an experiment, validating a condition, building a stimulus list) is pure functions taking data, returning data. I/O happens in a thin shell around the pure core. This makes tests trivial and bugs visible.

## Hard rules

1. **No ad-hoc schemas.** Every database change is a migration file, reviewed and committed, never edited in place.
2. **No cross-tenant references.** A row in tenant A cannot reference a row in tenant B. The DB schema must make this impossible, not just discouraged.
3. **No business logic in the UI.** Components display, they do not compute. Computation lives in hooks, services, or the server.
4. **No "magic" globals.** No singletons that hold state, no module-level mutation. Dependencies are passed in.
5. **Explicit state machines for any flow with >3 states.** Use XState. The experiment runner, the node-graph editor, and the onboarding flow all qualify.
6. **Versioning for experiment definitions is built in from day one.** Changing an experiment after it has run participants must not corrupt historical data. Definitions are immutable; new versions are new rows.
7. **No raw SQL in feature code.** All queries go through the ORM/query layer. Raw SQL is permitted in migrations and in a tightly-scoped reporting module.

## The node-graph specifically

The drag-and-drop whiteboard is the riskiest UX/data combination in the product. It deserves its own architectural sub-discipline:

- **The graph is a data structure, not a UI tree.** Persist it as a normalized node/edge model. The React Flow representation is a *view* of the graph, generated on load.
- **Every node type has a contract.** Inputs, outputs, validation, runtime behavior. Defined as a TypeScript type and a JSON Schema. Adding a node type is adding an ADR + a contract + a runtime handler + tests.
- **The runtime is separate from the editor.** Editing the graph and executing the graph are two different systems that share a contract. Do not couple them.
- **Cycles are detected on save, not at runtime.** Validation up front, deterministic execution downstream.

## When to escalate to an ADR

Trigger an ADR (`00_meta/rules/decision-records.md`) for any of:
- Choosing or replacing a library or service.
- Introducing a new pattern (a new way of doing auth, caching, error handling, etc.).
- Changing the tenancy or authorization model.
- Changing how experiments, trials, or responses are persisted.
- Changing the node-graph node contract.
- Anything where "we could go either way" — the ADR captures *why* we went one way.
