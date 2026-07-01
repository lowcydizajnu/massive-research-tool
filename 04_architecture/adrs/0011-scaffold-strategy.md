# ADR 0011 — Scaffold strategy

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** scaffold, build, mvp, runtime

## Context

Phase 3 (Design) is structurally complete enough to begin Build. The brief is at v0.6 (locked), tokens are materialized at `03_design/design-system/tokens.md`, IA at v0.3 (locked), nine wireframe specs cover the MVP-required surfaces, the build-a-study flow + the get-set-up JTBD anchor the user model. ADR-0007 picked Path A (Vercel + Clerk + Liveblocks + Inngest) with adapter discipline. ADR-0001/0002 lock module composition + the version model. ADR-0006 locks AI substrate-only for V1.

What's forcing this ADR: we're about to scaffold the Next.js app, and several decisions need locking before the first commit lands — directory shape, what's in the MVP slice vs deferred, how theming gets wired, how the manifest's schemas-first commitment shows up in code. Choosing wrong here is expensive to undo.

The project-owner explicit goal: scaffold MVP that proves Hanna's "build a study" loop end-to-end (auth → Studies list → New study from Framework → Builder configures 2 blocks → Save as named version → return tomorrow, find draft). No preregister, no participants, no Whiteboard. Smallest meaningful loop that demonstrates the wedge.

## Options considered

### Option A — Full vertical-slice scaffold this turn

- Scaffold Next.js app router + tRPC + Drizzle + Postgres + Clerk + Tailwind + shadcn/ui all in one session; ship a working /signup → /studies → /studies/[id]/build flow end to end.
- **Pros:** maximum momentum; real code immediately; concrete pressure-test of the brief and IA.
- **Cons:** very long single session; multiple decisions get made in code without ADR coverage (DB migration approach, tRPC router shape, auth-callback URL strategy); high context-window risk.

### Option B — Plan now, scaffold next session (project-owner picked)

- This ADR captures the scaffold shape, dependency choices, directory layout, MVP slice, deferred items. Next session executes against this plan.
- **Pros:** lets us validate ADR-0007 paths against wireframes before code; the ADR itself becomes the build checklist; lower thrash; matches the project's "ADR before code for any new architectural concept" discipline.
- **Cons:** delayed gratification; no actual code this turn; risk of plan drift if we discover something during scaffolding that contradicts it.

### Option C — Scaffold a hollow shell only (no business logic)

- Just `npx create-next-app` + Tailwind + token CSS variables + a single working theme toggle on a static page; defer everything else.
- **Pros:** unblocks "see real code" instinct without committing to the full slice.
- **Cons:** doesn't prove anything; doesn't pressure-test the brief; produces shell code we'll throw away.

## Decision

**We will use Option B — plan now, scaffold next session.** This ADR captures the canonical scaffold plan; next session's first commit lands a working app skeleton matching it.

The plan in detail:

**Stack (per ADR-0007, restated):**
- Runtime: Next.js 15+ (app router, RSC).
- API: tRPC v11 inside Next.js route handlers.
- DB: Postgres (Neon for dev, Vercel Postgres for prod) accessed via Drizzle ORM with `drizzle-kit` for migrations.
- Auth: Clerk (behind `AuthAdapter` interface per ADR-0007).
- Realtime: Liveblocks (behind `RealtimeAdapter`) — wired but not used in V1 features.
- Background: Inngest (behind `BackgroundJobAdapter`) — wired but only stub jobs in V1.
- UI: Tailwind + shadcn/ui (Radix primitives).
- Tokens: CSS variables on `:root` + `[data-theme="dark"]`, generated from `03_design/design-system/tokens.md`.
- Validation: Zod (matches ADR-0001 schemas-first commitment).

**Directory layout under `05_app/`:**

```
05_app/
├── app/                      # Next.js app router
│   ├── (auth)/signup/        # Signup + onboard
│   ├── (auth)/sign-in/       
│   ├── (app)/                # Authenticated routes
│   │   ├── studies/page.tsx  # Studies destination
│   │   ├── studies/[id]/build/page.tsx
│   │   ├── library/          # Library destination
│   │   ├── frameworks/       # Frameworks destination
│   │   └── settings/account/page.tsx
│   ├── api/trpc/[trpc]/      # tRPC handler
│   └── layout.tsx            # ThemeProvider wraps here
├── components/
│   ├── ui/                   # shadcn primitives
│   ├── chrome/               # TopBar, LeftRail, RightContextPanel, StageTabsPill
│   └── feature/              # StudyCard, ModulePicker, SaveDialog
├── server/
│   ├── db/                   # Drizzle schema + migrations
│   ├── trpc/                 # routers (studies, library, frameworks, account)
│   ├── adapters/             # AuthAdapter, RealtimeAdapter, BackgroundJobAdapter, RegistryAdapter
│   └── modules/              # ModuleRegistry, schema validation per ADR-0001
├── styles/
│   └── tokens.css            # CSS variables generated from 03_design/design-system/tokens.md
├── tests/
│   ├── unit/
│   ├── integration/          # hits real Postgres per QA rule
│   └── e2e/                  # Playwright; Hanna's build flow as first e2e
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts        # reads from tokens.css
├── package.json
└── README.md
```

**MVP slice — what gets built first:**

1. App skeleton + ThemeProvider + token CSS variables + theme toggle working on a static page.
2. Clerk auth wired; `/signup` flow per `signup-onboarding` wireframe (email magic-link + Google OAuth + display name + theme picker + workspace name).
3. Drizzle schema for Workspace, Member, Experiment, ExperimentVersion (per `04_architecture/data-model/00-core-entities.md`); migrations committed.
4. tRPC routers: `workspace`, `studies`, `library` (read-only catalogue), `frameworks` (read-only catalogue).
5. Studies destination per `studies-destination` wireframe — list + sub-nav + `+ New study` button + empty state.
6. New study modal per `new-study-modal` wireframe — Framework / Template / Blank with Framework picker.
7. Build stage Builder mode per `build-stage-builder-mode` (v0.5.3) wireframe — top bar slim + stage-tabs pill above center + work surface with two block cards.
8. Save-as-version dialog per `save-as-version-dialog` wireframe — autosave / named / save-and-request-review (the last falls back to named in MVP since Share stage isn't built).
9. One Framework seeded: Misinformation Research Framework with two recommended blocks (Stimulus, Manipulation check).
10. Module picker popover per `module-picker-popover` wireframe — minimal catalogue.

**Deferred from MVP (V1.5+):**

- Whiteboard mode, Replications tab (forks-as-relationship view), Activity destination (Yours/Follows), Participants destination (five sub-views), Team destination, Preregister / Share / Run / Results stages.
- OSF push (ADR-0005 architecture in place; UI deferred).
- AI features (ADR-0006 substrate stays uninstalled in V1).
- Recruitment / provider connections (ADR-0009 layer 2 GTM, not V1 features).

**Build sequence within each MVP item:**

For every feature shipped: (a) write a failing e2e test against Hanna's flow first per `qa-and-testing.md`, (b) make it pass, (c) write the feature-spec artifact alongside (per `feature-spec` schema), (d) PR with `pr-checklist`.

## Consequences

**What becomes easier:**
- The next session has a checklist. No "what should I do first?"
- Onboarding any future contributor (including future-Claude) — this ADR plus the brief plus the wireframes specify almost everything.
- Honest scope policing — the MVP cut is explicit; anything outside it gets a "deferred to V1.5" stamp.
- Adapter discipline from ADR-0007 gets exercised on day one (every external service behind a typed adapter).

**What becomes harder:**
- If we discover during scaffolding that the directory layout above is wrong (e.g., needs a `monorepo` shape), we need an ADR-0011 revision rather than a quiet fix.
- Pressure on us to actually validate against the plan, not drift. Validator + e2e tests are the discipline mechanism.

**What we are now committed to:**
- Next.js 15+ app router as the runtime shape.
- tRPC for the API (not REST, not GraphQL).
- Drizzle as the ORM (not Prisma).
- Clerk for auth (with `AuthAdapter` insulating us per ADR-0007).
- The MVP scope above — only those features in V1.
- Schemas-first validation at module boundaries per ADR-0001.

**What we are now precluded from:**
- Shipping a V1 with Whiteboard mode, AI features, OSF push, or recruitment. Those are V1.5+ explicitly.
- Adding a non-Next.js client (mobile native, CLI) in V1 — the runtime decision is web-first.
- Using parallel state-shape sources (e.g., raw SQL alongside Drizzle) — Drizzle owns the schema.

## Revisit triggers

- The MVP slice doesn't survive contact with code — a wireframe spec turns out to mis-describe a flow, or two adapters compete for the same concern. Rewrite this ADR before continuing.
- ADR-0007's cost ceilings ($200/mo plan, $500/mo execute per piece) start to bite during MVP — switch one adapter to its alternative per the migration order in ADR-0007.
- We add a second non-Next.js client (CLI for power users, mobile native participant app) — the runtime decision needs amendment.
- We hire a real engineer to take over from Claude — the ADR shape may need adjusting to a team workflow.

## References

- ADR-0001 — Modular composition + theme overlays (the module catalogue and schema-first contract this scaffold consumes).
- ADR-0002 — Forking model (the ExperimentVersion `kind` enum the scaffold must enforce).
- ADR-0003 — Asset storage (R2 + external link; the scaffold sets up the storage interface but no UI).
- ADR-0004 — Preregistration amendments (data-model fields present from day one; UI deferred).
- ADR-0005 — OSF integration (adapter interface present; no push in V1).
- ADR-0006 — AI plug-in architecture (substrate + audit log only).
- ADR-0007 — Path A vs B (the entire infrastructure choice this ADR depends on).
- ADR-0009 — Supply-side strategy (the MVP demand-first cut comes from here).
- `02_product/product-brief.md` — vision and resolved decisions.
- `02_product/jobs-to-be-done/build-a-study.md` + `get-set-up.md` — the JTBDs the MVP serves.
- `02_product/user-flows/hanna-build-a-study.md` — the canonical user flow for the MVP loop.
- `03_design/design-language-brief.md` v0.6 — visual + chrome specification.
- `03_design/design-system/tokens.md` — token contract for implementation.
- `03_design/ia/information-architecture.md` v0.3 — the surface map.
- `03_design/wireframes/` — nine wireframe specs covering the MVP surfaces.
- `04_architecture/data-model/00-core-entities.md` — DB shape.
- `STACK.md` — runtime stack rationale.
- `00_meta/rules/qa-and-testing.md` — test discipline for the scaffold.
