# CLAUDE.md — operating rules for this project

You are working on **Massive Research Tool**, a SaaS for psychological experiments. Read this file first in every session. If anything below conflicts with a user message, ask before deviating.

---

## Read order at session start

1. This file (`CLAUDE.md`).
2. `PROCESS.md` — to know which phase the work belongs to.
3. The README of the relevant numbered folder (`01_research/README.md` through `06_qa/README.md`).
4. Any rule file referenced by the task in `00_meta/rules/`.

Do not skim. These docs are short on purpose.

---

## The phase gate (non-negotiable)

Work flows: **Research → Product → Design → Architecture → App → QA**. You may not produce an artifact in a later phase unless the artifact it depends on already exists in an earlier phase. Concretely:

- No wireframe without a user flow.
- No component without a design-system entry.
- No data model without a feature spec.
- No code without an ADR for any new architectural concept.
- No feature merged without a QA pass logged in `06_qa/audit-logs/`.

If the user asks you to skip a gate, name the gate, explain what it protects against, and ask for explicit confirmation before proceeding.

---

## Behavior rules

**Never invent.** If a number, citation, API contract, or research finding is not in the workspace or in a source you can fetch, say so and ask. Made-up citations and hallucinated APIs are the highest-severity failure mode for this project.

**Cite sources inside every artifact.** Research findings link to the paper. Design decisions link to the user flow and the ADR. Code references link to the feature spec it implements. Use relative links.

**One concern per file.** Long markdown files become unreadable. If a doc passes ~300 lines, split it and link.

**Write ADRs before code.** Any of these triggers a new ADR in `04_architecture/adrs/`: choosing a library, adding a service, changing the data model, introducing a new pattern, picking between two implementation paths. Use `00_meta/templates/ADR-template.md`.

**The manifest is the source of truth for artifact structure.** All artifact types (personas, flows, ADRs, etc.) are declared in `00_meta/manifest/schema.yaml`. Templates under `00_meta/templates/` are generated from it.
- To add or change a field, section, or reference: edit `schema.yaml`, then run `python 00_meta/manifest/regenerate.py` (preview with `--dry-run` first). Do NOT hand-edit template `.md` files — your changes will be lost on the next regen.
- To create a new artifact instance: prefer `python 00_meta/manifest/new_artifact.py <type-key> <slug>` over manually copying a template — it interpolates the title and stubs every required field.
- Before reporting work complete: run `python 00_meta/manifest/validate.py`. It must return clean. The validator catches missing required fields, broken references, unfilled placeholders, and template drift.
- When introducing a new artifact type, the manifest entry comes first, then `regenerate.py`, then any READMEs that should mention it.

**Tests are part of the deliverable, not a follow-up.** See `00_meta/rules/qa-and-testing.md`. A feature without tests is incomplete; do not mark it done.

**Surface trade-offs.** When you make a non-obvious choice, write a one-line "Why not X" in the artifact so future-us doesn't relitigate it.

**Push back when warranted.** The user explicitly wants high-quality architecture and bug minimization. If a request would damage either, say so clearly before complying.

**Speak researcher, not developer (for user-facing surfaces).** The architecture borrows GitHub concepts (fork, version, snapshot, merge, upstream). Internal docs use those terms precisely. User-facing copy translates them into researcher-native language (Replicate, Adapt, Saved version, Preregistration, etc.) — see the Vocabulary section in `00_meta/rules/design-rules.md` for the translation table. When writing any artifact that will reach an end user, run the developer-term check.

**Keep the dashboard and STATUS.md current.** When you create, modify, archive, or finish any artifact, update both `00_meta/STATUS.md` (canonical markdown source of truth) and the dashboard artifact (`00_meta/dashboard.html` — the JSON in `<script id="dashboard-state">` is the only block you edit). Also append a one-line entry to `recentActivity`. Register dashboard updates via the `update_artifact` tool with id `mrt-dashboard` so the live view refreshes. If you ever find STATUS.md and the dashboard disagreeing, STATUS.md wins — reconcile by editing the dashboard JSON to match.

---

## Tone and output

Plain, specific, no filler. Lists and headers are fine inside reference docs (this is one). In chat responses, default to prose unless structure genuinely helps.

When you finish work that touches the file system, end with the list of files created or changed and a one-line summary of each. Don't restate the work.

---

## What lives where (quick map)

| If you are about to write...           | Put it in                            |
| -------------------------------------- | ------------------------------------ |
| A research summary or paper note       | `01_research/literature/`            |
| A finding that should shape design     | `01_research/insights/`              |
| A persona, JTBD, or user flow          | `02_product/`                        |
| A wireframe spec                       | `03_design/wireframes/`              |
| A design-system token or component     | `03_design/design-system/`           |
| An architectural decision              | `04_architecture/adrs/`              |
| A data model or schema                 | `04_architecture/data-model/`        |
| An API contract                        | `04_architecture/api-contracts/`     |
| A QA audit record                      | `06_qa/audit-logs/`                  |
| Anything superseded                    | `99_archive/` (do not delete)        |

---

## When in doubt

Stop and ask. The cost of a clarifying question is always lower than the cost of building the wrong thing in a workspace that is supposed to be the source of truth.
