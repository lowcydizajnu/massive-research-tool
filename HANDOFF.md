# HANDOFF — start here, every session

> If you are a Claude session (Cowork, Code tab, Claude Code CLI, or anything else): **read `CLAUDE.md` first, then `00_meta/STATUS.md`, then proceed.**
> If you are the project owner returning after time away: read `00_meta/STATUS.md`.

That's the whole system. Everything below is detail.

## The one rule that holds context together

**`00_meta/STATUS.md` is the canonical state.** Last updated date, current focus, phase pipeline, what's recent, what's next. Both Claude sessions and the project owner sync to it. If the dashboard disagrees with STATUS.md, STATUS.md wins (and gets reconciled by editing the dashboard JSON to match).

Memory stores (Cowork-specific localStorage) are *not* the source of truth. Their effect is materialized in artifacts on disk — brief, tokens, ADRs, wireframes. Switching tools doesn't lose anything load-bearing.

## What every Claude session does at session start (in order)

1. Read `CLAUDE.md` — the rules.
2. Read `PROCESS.md` — the phase-gate workflow.
3. Read `00_meta/STATUS.md` — where we are, what's next.
4. Read the README of the active phase folder if the work is scoped to one.
5. Read any rule file referenced by the active task (`00_meta/rules/`).

That's it. Five files, in order. No memorized state.

## What every Claude session does at the end of a unit of work

1. Run `python 00_meta/manifest/validate.py` — must return clean.
2. Update `00_meta/STATUS.md` (current focus + a one-line `## Recent activity` entry).
3. Update `00_meta/dashboard.html` (the JSON in `<script id="dashboard-state">`; `recentActivity` array; push via the artifact update mechanism if available).
4. `git add . && git commit -m "<type>(<scope>): <imperative subject>` with body referencing the spec / ADR / STATUS section and a `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
5. Tell the user what landed and what's next.

## Where to switch tools

| Phase / Activity | Best tool | Why |
| --- | --- | --- |
| Design conversations, mockups, strategy decisions | Cowork tab | Inline visualizers, pinned dashboard artifact, AskUserQuestion modal |
| Architecture decisions, ADR drafting | Either | Both read the same files |
| Code writing + iteration | Code tab | Runs commands on the Mac directly; sees real error output |
| Running the app + verifying | User's machine | Always |
| Reviewing work, stepping back, planning the next sprint | Cowork tab | Dashboard view is nicer |

Heuristic: *"Am I writing code right now?"* → Code tab. *"Am I deciding what to build?"* → either tab works; Cowork has nicer UI for it. *"Am I running the app?"* → that's always you.

## Starter messages for each tab

For any new session in Cowork tab, Code tab, or CLI, the minimum to paste:

> Continue from `00_meta/STATUS.md`.

That's enough. Claude reads STATUS, finds the current focus + suggested next moves, picks up.

If you want to pin a specific next move (skip the picking step):

> Continue from STATUS.md. Next move is `<the suggested-next-move title from the file>`. I have `<any credentials or decisions you've gathered since last session>` ready.

If you want a recap before continuing:

> Recap where we are.

## Current waypoint (2026-05-29)

- Phase 3 (Design) locked at v0.6.
- Phase 4 (Architecture) at 10 ADRs + lock-in inventory.
- Phase 5 (Build) started. App scaffold in `05_app/` + AuthAdapter discipline + ADR-0007 amendment. Scaffold verified.
- **Next:** Clerk + Drizzle + signup commit per ADR-0011 step 2. Requires Clerk publishable + secret keys and a Postgres connection string in `05_app/.env.local`.
- **Repo:** initialized as of `326f9ee chore(baseline): initialize repo with Phase 0-5 work to date`. Remote: GitHub (to be added by user).

## Project owner setup checklist (one-time)

- [ ] Add GitHub remote and push the baseline commit. See `00_meta/STATUS.md` for the exact commands (the suggested next moves section).
- [ ] Set up a Clerk account at <https://clerk.com>, create an application, copy the publishable + secret keys.
- [ ] Set up a Postgres database (Neon free tier at <https://neon.tech> is easiest), copy the connection string.
- [ ] Paste all three into `05_app/.env.local`.
- [ ] Switch to Code tab for the next coding session.

When those four are done, the Clerk + Drizzle commit lands cleanly on the first try.

## What "lost context" looks like + the fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| Claude proposes a design pattern that contradicts v0.6 brief | Didn't read the design files before coding | Point at `03_design/design-language-brief.md` v0.6 + `03_design/design-system/tokens.md` + the relevant wireframe spec |
| Claude invents a new ADR-shaped decision in chat instead of writing the ADR | Skipped the "no code without an ADR for new architectural concepts" rule from `CLAUDE.md` | Ask for the ADR first |
| Claude makes a code change without a commit | Skipped step 4 of the end-of-unit checklist above | Ask for the commit |
| Project owner can't find where we are | Hasn't checked STATUS.md | Read STATUS.md |
| STATUS.md and dashboard disagree | One was updated, the other wasn't | STATUS.md wins; reconcile dashboard to match |
| Claude in Code tab doesn't know about a design preference saved in Cowork memory | Memory stores are tab-specific | The *effect* of any durable preference is already in the brief / tokens / ADRs. If something genuinely got lost, write a feedback rule to `00_meta/rules/design-rules.md` so it persists in the repo |

## File map — what to read for what

| If you need… | Read |
| --- | --- |
| Rules I follow | `CLAUDE.md` |
| Phase-gate workflow | `PROCESS.md` |
| Where we are right now | `00_meta/STATUS.md` |
| The stack rationale | `STACK.md` |
| Design intent | `03_design/design-language-brief.md` |
| Design tokens | `03_design/design-system/tokens.md` |
| Information architecture | `03_design/ia/information-architecture.md` |
| A specific surface's spec | `03_design/wireframes/<slug>.md` |
| Why we picked X | The relevant ADR in `04_architecture/adrs/` |
| Data model | `04_architecture/data-model/00-core-entities.md` |
| Vendor lock-in posture | `04_architecture/lock-in-inventory.md` |
| User flow | `02_product/user-flows/<slug>.md` |
| Persona | `02_product/personas/<slug>.md` |
| App code | `05_app/` |
| Test strategy | `06_qa/test-strategy.md` |

If you're a Claude session, you don't have to read all of these every time. Read the ones the active work touches.
