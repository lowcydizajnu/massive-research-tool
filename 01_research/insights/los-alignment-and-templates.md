# Insight — Alignment with OSF "Lifecycle Open Science" + the preregistration-template gap

- **Status:** in review
- **Evidence basis:** OSF/COS newsletter (July 2026) + [cos.io/los](https://www.cos.io/los) + OSF registrations help + the Eye-Tracking template Q&A; cross-referenced against a 5-dimension codebase audit (2026-07-09)
- **Confidence:** high on the *current-state* map (grounded in code/ADRs); medium on the *prioritisation* (product judgement)
- **Source materials:** OSF newsletter (linked by project owner), [finished-studies-and-comparable-discovery](finished-studies-and-comparable-discovery.md), ADR-0002/0004/0005/0054/0055/0056/0094
- **Last updated:** 2026-07-09

## Headline

The newsletter's framing is **Lifecycle Open Science (LOS)**: *"doing and sharing research so that plans, outputs, and outcomes are transparent, accessible, linked, and findable over time"* — connect **Plan** (preregistration) → **Produce** (data, code, materials, preprints) → **Report** (outcomes), with every artifact bound together by **structured metadata + persistent identifiers** (DOI, ORCID, ROR, DataCite, Crossref Funder).

We are **strongly aligned on the *spine*** of LOS and **thin on the *connective tissue*** — which is precisely what LOS is about. The spine (a genuinely immutable, time-stamped preregistration; a composable, citable Study Record that assembles the whole path; a real, live-verified OSF push) is arguably *stronger* than OSF for the study **design**, because our frozen snapshot is a runnable, self-describing artifact, not prose. But the connective tissue LOS actually sells — a **template-structured plan**, **PIDs beyond the registration DOI**, **structured resource links back to the plan**, and **machine-readable public findability** — is largely missing or, in two cases, *captured but never surfaced*.

Two findings stand out because they quietly defeat the LOS promise today:

1. **Our "public" study records are not actually public.** `/browse(.*)` is auth-gated in [middleware.ts](../../05_app/middleware.ts), so a `visibility:'public'` record is reachable only by logged-in users of *other* workspaces — not anonymous readers and not crawlers. The Cite/Share URL doesn't resolve for the outside world, and we emit **zero** machine-readable metadata (no schema.org/JSON-LD, sitemap, robots, or OpenGraph). LOS is "findable, connected, verifiable"; today the record is none of those *to the web*.
2. **We already capture the anchors and then hide them.** We fetch and store the OSF **registration DOI** (`experiment_version.externalRegistrationDoi`) but `getPublicStudy` never selects it, so the public record shows no DOI and no "view registration on OSF" link. We store each researcher's **ORCID** (`user.orcid`) but the OSF contributor push sends name+email only. The connective identifiers exist in the DB and never reach the surface where LOS wants them.

## The framework, briefly

LOS = three stages + connective infrastructure, backed by four COS pillars (infrastructure, policy, training, research). The newsletter's concrete asks: **start with a preregistration**, **share outputs and outcomes**, **connect the record** with metadata + PIDs, and it spotlights OSF's **preregistration templates** (a new domain-specific **Eye-Tracking** template) — the lesson being that domain templates *"force decisions researchers might otherwise defer until the data are in front of them."*

## Alignment scorecard

| LOS dimension | Where we are | Verdict |
|---|---|---|
| **PLAN** — preregistration | Immutable, time-stamped, amendable *design snapshot* ([studies.ts preregister](../../05_app/server/trpc/routers/studies.ts), ADR-0002/0004). But it's *freeze-the-design*, not *fill-a-schema*: only abstract + `hypotheses[]` are typed; sampling/analysis/variables/expected-outcomes are optional free-markdown. **No template picker.** OSF schema auto-chosen (Open-Ended default; Replication Recipe if replication intent); field-by-field OSF mapping deferred (ADR-0005, "V1.6"). | **Strong core, thin structure** |
| **PRODUCE** — outputs | Of OSF's 5 resource-link badges, only **Materials** reach OSF (ADR-0094, WaterButler). Data = client-side download only ([export-builder](../../05_app/components/feature/results/export-builder.tsx)); analytic code = auto SPSS/Stata companions (local); article DOI pasted as *prose* into the node description; no preprint/supplement linking. | **Partial (1 of 5)** |
| **REPORT** — outcomes | Excellent citable **Study Record** (ADR-0054/0056) assembling method+prereg+materials+data+results+replications; withdrawal propagates app-wide. But **outcomes don't link back to the plan** (prereg section is a one-liner), **no planned-vs-exploratory / deviations** reporting, amendments are invisible publicly, public Results = owner prose only. | **Great surface, missing the link-back** |
| **CONNECT** — OSF + PIDs | Real OAuth/PAT push: 4-call registration, DOI backfill, amendments, withdrawal, contributors, materials — verified vs live OSF API ([registry.osf.ts](../../05_app/server/adapters/registry.osf.ts), ADR-0005). But only the **registration DOI** is consumed; **ORCID stored, never sent**; no ROR / DataCite resource type / Crossref funder; outputs not registered as typed OSF resources. | **Solid pipe, missing the PIDs** |
| **FINDABILITY** — metadata | Title, Description, Abstract, free-form Tags, profile ORCID present; faceted browse + `ilike` search. **Missing:** license (nowhere), ROR, funder, controlled Subjects, DataCite type, per-study language, **any** machine-readable metadata; **and the public record is auth-gated** (not web-reachable). | **Weakest — blocks the whole LOS payoff** |

## Templates — the detail the owner asked for

OSF ships **14 registration templates**; the researcher picks one and it structures the plan: *OSF Preregistration* (standard: hypotheses, design plan, sampling plan, variables, analysis plan, expected outcomes), *AsPredicted (8Q)*, *Qualitative*, *Secondary Data*, *Pre-Registration in Social Psychology*, *Theory-based Predictions*, *Registered Report Protocol*, *Replication Recipe (pre/post)*, *Generalized Systematic Review*, *EEG/ERP*, **Eye-tracking**, *Simulation (ADEMP)*, *Open-Ended*.

**We reach exactly 2, both generic and both system-chosen** — Open-Ended (default) and Replication Recipe (only when a replication is declared) — via [registry-push.ts](../../05_app/server/jobs/registry-push.ts). There is **no picker** and no structured schema. Our "Framework" primitive (e.g. the Misinformation Research Framework) templates the study **design** (which blocks you start from), *not* the **plan structure** — a template concept at the wrong layer for LOS's PLAN pillar.

**The strategic opportunity** (this is the most interesting thing the newsletter surfaces for us): OSF adds domain templates *because generic templates miss method-specific decisions* (the Eye-Tracking Q&A: calibration, AOIs, preprocessing thresholds, exclusion criteria). **Our studies are already built from method-specific blocks** (image-interaction, timed-exposure, heat-map/hot-spot, social-post stimuli, emotion, EVI voice). So we can do something OSF can't: **derive the method/design sections of the preregistration automatically from the runnable study** — the plan writes itself from what was actually built, method decisions included, with the researcher filling only the reasoning (hypotheses, sampling, analysis). That's a stronger version of the domain-template idea, not just a catch-up.

## What we should improve — prioritised

**Now (high-leverage, mostly small; each closes a "captured-but-hidden" or "one-line" gap):**
1. **Make public records genuinely public + crawlable** — drop `/browse` detail from the protected matcher in [middleware.ts](../../05_app/middleware.ts); add JSON-LD (schema.org `Dataset`/`ScholarlyArticle`), `sitemap.ts`, `robots.ts`, OpenGraph. *Unblocks the entire LOS "findable" claim.*
2. **Surface the registration DOI on the record** — include `externalRegistrationDoi`/`Url` in `getPublicStudy`; render an identifiers row + "View registration on OSF" + link-back. *The plan↔record anchor the wireframe ([study-record.md](../../03_design/wireframes/study-record.md)) already specifies.*
3. **Push contributor ORCID to OSF** — thread `user.orcid` through the contributor payload ([registry-push.ts](../../05_app/server/jobs/registry-push.ts)). *Already backlogged (V1.15 #5 / OSF-5); highest-leverage PID fix.*
4. **Add a License selector** (SPDX/CC controlled list) on the study + published dataset → render on the record, map to OSF `node_license`. *"Reusable" is currently unrepresentable.*

**Next (structural; each wants an ADR first per CLAUDE.md):**
5. **Preregistration template picker + typed OSF-standard fields** — sampling plan (target N + **data-collection-status** + stopping rule), analysis plan, variables, expected outcomes as first-class fields; make data-collection-status a *hard* preflight (today the gate is advisory, [preflight.ts](../../05_app/server/modules/preflight.ts)). This unblocks the already-sketched OSF field-by-field push (ADR-0005). *The single biggest PLAN gap.*
6. **Plan↔Report link-back** — per-hypothesis `preregistered | exploratory` chip; a first-class "Deviations from the plan" section (seed from amendment change-summaries); render amendment lineage + the "amended after finishing" banner publicly; resolve headline aggregate results into the public Results section (aggregate-only per ADR-0014).
7. **Structured OSF resource links** — register the article DOI + materials as *typed* OSF resources / related-identifiers pointing at the registration DOI, instead of prose in the node description. *Turns co-location into the connected graph LOS specifies.*
8. **Opt-in "publish dataset to OSF"** — push the export-builder's chosen de-identified/aggregate dataset as a **Data** resource (reuse the WaterButler plumbing), consent-gated, PII boundary intact (ADR-0014/0094).

**Later (breadth):**
9. **Domain/method-derived prereg templates** — Social Psychology + Secondary Data first; then the differentiator in §Templates: auto-populate method/design from the built blocks.
10. **Remaining metadata PIDs** — ROR affiliation, Crossref Funder Registry, controlled Subjects vocabulary, DataCite resource type, per-study language (ADR-0055 already commits language).

## What this insight does NOT settle

- **Sequencing vs. the current roadmap** — several items (template picker, funder/ROR) are Large; whether they precede other V-line work is the owner's call.
- **DOI ownership** — should the *record* mint its own DataCite DOI, or always adopt the OSF registration DOI as canonical? (Affects Cite + lock-in; touches the DataCite adapter seam noted in the lock-in inventory.)
- **How far to chase two-way sync** — the OSF watch pulls DOI + withdrawal only; full content bidirectionality is likely not worth it (registrations are immutable), but a *drift indicator* might be.
- These are framework-alignment gaps, not defects — the existing spine is sound; this is about extending it to the connective tissue LOS rewards.
