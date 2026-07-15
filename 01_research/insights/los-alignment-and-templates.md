# Insight — Alignment with OSF "Lifecycle Open Science" + the preregistration-template gap

- **Status:** in review
- **Evidence basis:** OSF/COS newsletter (July 2026) + cos.io/los + OSF registrations help + the Eye-Tracking template Q&A, cross-referenced against a 5-dimension codebase audit (2026-07-09)
- **Confidence:** high
- **Source materials:** OSF newsletter (linked by project owner); [finished-studies-and-comparable-discovery](finished-studies-and-comparable-discovery.md); ADR-0002/0004/0005/0054/0055/0056/0094
- **Last updated:** 2026-07-09

## Headline

The newsletter's framing is **Lifecycle Open Science (LOS)**: *"doing and sharing research so that plans, outputs, and outcomes are transparent, accessible, linked, and findable over time"* — connect **Plan** (preregistration) → **Produce** (data, code, materials, preprints) → **Report** (outcomes), bound together by **structured metadata + persistent identifiers** (DOI, ORCID, ROR, DataCite, Crossref Funder).

We are **strongly aligned on the *spine*** of LOS and **thin on the *connective tissue*** — which is precisely what LOS is about. The spine (a genuinely immutable, time-stamped preregistration; a composable, citable Study Record that assembles the whole path; a real, live-verified OSF push) is arguably *stronger* than OSF for the study **design**, because our frozen snapshot is a runnable, self-describing artifact, not prose. But the connective tissue LOS actually sells — a **template-structured plan**, **PIDs beyond the registration DOI**, **structured resource links back to the plan**, and **machine-readable public findability** — is largely missing or, in two cases, *captured but never surfaced*.

## Evidence

**Two findings quietly defeat the LOS promise today:**

1. **Our "public" study records are not actually public.** `/browse` is auth-gated in [middleware.ts](../../05_app/middleware.ts), so a `visibility:'public'` record is reachable only by logged-in users of *other* workspaces — not anonymous readers and not crawlers. The Cite/Share URL doesn't resolve for the outside world, and we emit **zero** machine-readable metadata (no schema.org/JSON-LD, sitemap, robots, or OpenGraph).
2. **We capture the anchors and then hide them.** We fetch and store the OSF **registration DOI** (`experiment_version.externalRegistrationDoi`) but `getPublicStudy` never selected it. We store each researcher's **ORCID** (`user.orcid`) but the OSF contributor push sends name+email only.

**Alignment scorecard** (grounded in the audit):

| LOS dimension | Where we are | Verdict |
|---|---|---|
| **PLAN** — preregistration | Immutable, time-stamped, amendable *design snapshot* (ADR-0002/0004). But it's *freeze-the-design*, not *fill-a-schema*: only abstract + `hypotheses[]` are typed; sampling/analysis/variables/expected-outcomes are optional free-markdown. **No template picker.** OSF schema auto-chosen (Open-Ended default; Replication Recipe if replication intent); field-by-field OSF mapping deferred (ADR-0005). | Strong core, thin structure |
| **PRODUCE** — outputs | Of OSF's 5 resource-link badges, only **Materials** reach OSF (ADR-0094, WaterButler). Data = client-side download only; analytic code = auto SPSS/Stata companions (local); article DOI pasted as *prose* into the node description; no preprint/supplement linking. | Partial (1 of 5) |
| **REPORT** — outcomes | Excellent citable **Study Record** (ADR-0054/0056). But **outcomes don't link back to the plan** (prereg section is a one-liner), **no planned-vs-exploratory / deviations** reporting, amendments invisible publicly, public Results = owner prose only. | Great surface, missing the link-back |
| **CONNECT** — OSF + PIDs | Real OAuth/PAT push: 4-call registration, DOI backfill, amendments, withdrawal, contributors, materials — verified vs live OSF API. But only the **registration DOI** is consumed; **ORCID stored, never sent**; no ROR / DataCite resource type / Crossref funder; outputs not registered as typed OSF resources. | Solid pipe, missing the PIDs |
| **FINDABILITY** — metadata | Title, Description, Abstract, free-form Tags, profile ORCID present. **Missing:** license, ROR, funder, controlled Subjects, DataCite type, per-study language, **any** machine-readable metadata; **and the public record is auth-gated**. | Weakest — blocks the whole LOS payoff |

**Templates — the detail the owner asked for.** OSF ships **14 registration templates** (standard OSF Preregistration, AsPredicted, Qualitative, Secondary Data, Social Psychology, Theory-based, Registered Report Protocol, Replication Recipe pre/post, Generalized Systematic Review, EEG/ERP, **Eye-tracking**, Simulation/ADEMP, Open-Ended); the researcher picks one and it structures the plan. **We reach exactly 2, both generic and both system-chosen** (Open-Ended default; Replication Recipe only when a replication is declared) — no picker, no structured schema. Our "Framework" primitive templates the study **design**, *not* the **plan structure** — a template concept at the wrong layer for LOS's PLAN pillar. The strategic opening: OSF adds domain templates *because generic ones miss method-specific decisions* (their Eye-Tracking Q&A: calibration, AOIs, exclusion thresholds, and *"forces decisions researchers might otherwise defer until the data are in front of them"*). Our studies are **already built from method-specific blocks**, so we can do what OSF can't: **auto-derive the method/design sections of the preregistration from the runnable study** — the plan writes itself from what was built; the researcher fills only the reasoning.

## What this implies for the product

**Now (small, high-leverage — close the "captured-but-hidden" gaps):**
1. Make public records + profiles genuinely public + crawlable (drop `/browse` from the auth shell; add JSON-LD, sitemap, robots).
2. Surface the registration DOI + "View registration on OSF" link-back on the record (include `externalRegistrationDoi` in `getPublicStudy`). — **done**
3. Surface the author **ORCID** on the record (OSF-side push stays the deferred OSF-5 registered-contributor path). — **done**
4. Add a **License** selector (default CC-BY-4.0) → record + OSF text (ADR-0100). — **done**

**Next (structural, ADR-first):** ⑤ **preregistration template picker + typed OSF-standard fields** (sampling plan, data-collection-status as a hard gate, analysis plan, variables, expected outcomes) — the biggest Plan gap, unblocks the deferred field-by-field OSF push; ⑥ **plan↔report link-back** (preregistered/exploratory chips + a Deviations section + public amendment lineage); ⑦ register outputs as **typed OSF resources** pointing at the registration DOI; ⑧ opt-in **publish dataset to OSF** (aggregate/de-identified).

**Later:** ⑨ domain/method-derived templates; ⑩ remaining PIDs (ROR, funder, Subjects, DataCite type, language).

## What this insight does NOT tell us

- **Sequencing vs. the current roadmap** — the Large items (template picker, funder/ROR) may or may not precede other V-line work; that's the owner's call.
- **DOI ownership** — should the *record* mint its own DataCite DOI, or always adopt the OSF registration DOI as canonical? (Affects Cite + lock-in; touches the DataCite adapter seam.)
- **How far to chase two-way sync** — the OSF watch pulls DOI + withdrawal only; full content bidirectionality is likely not worth it, but a *drift indicator* might be.
- These are framework-alignment gaps, not defects — the existing spine is sound; this is about extending it to the connective tissue LOS rewards.

## Sources

- OSF/COS "Lifecycle Open Science" newsletter (July 2026) — linked by the project owner; cos.io/los; OSF registrations help (`help.osf.io/article/330`); the Eye-Tracking Preregistration Template Q&A (cos.io/blog).
- Internal 5-dimension codebase audit (2026-07-09), grounded in `05_app` + ADR-0002/0004/0005/0054/0055/0056/0094.
- Related insight: [finished-studies-and-comparable-discovery](finished-studies-and-comparable-discovery.md).
