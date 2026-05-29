# Massive Research Tool

A SaaS platform for designing, running, and analyzing psychological experiments. End-user-facing, multi-tenant, multi-project, with flexible workflows that range from form-based configuration to drag-and-drop node graphs on a whiteboard.

## How this workspace is organized

This folder is intentionally not a code repo (yet). It is the **single source of truth for the whole product** — science, product thinking, design, architecture, and eventually the application code. We work in numbered phases so the dependency chain is visible: research informs product thinking, which informs design, which informs architecture, which informs the app.

```
00_meta/              How we work — rules, templates, ways of working
01_research/          The science layer — papers, protocols, insights, decisions
02_product/           Personas, jobs-to-be-done, user flows, user journeys
03_design/            Inspiration, IA, wireframes, design system, prototypes, handoff
04_architecture/      ADRs, system diagrams, data model, API contracts
05_app/               The application code (created in the Build phase)
06_qa/                Test strategy, audit logs, verification records
99_archive/           Superseded docs preserved for traceability
```

## Where to start

1. Read `CLAUDE.md` — the rules every session begins with.
2. Read `PROCESS.md` — the end-to-end workflow, phase gates, and definitions of done.
3. Read `STACK.md` — the technology recommendation and its rationale.
4. Open the folder for the current phase and follow its README.

## Operating principle

We move slowly enough to be right, then fast enough to ship. Every artifact must trace back to a research insight or a user need, and every architectural choice must be recorded as an ADR before code is written.
