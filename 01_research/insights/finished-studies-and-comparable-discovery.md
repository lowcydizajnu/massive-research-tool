# Insight — Finished studies need a comparable, citable record

- **Status:** in review
- **Evidence basis:** literature synthesis + prior internal insights + the team's own walkthrough of the OSF reading experience (2026-06-18)
- **Confidence:** medium
- **Source materials:** [researcher-tooling-pain-points](researcher-tooling-pain-points.md), [persona-segmentation-and-strategic-risks](persona-segmentation-and-strategic-risks.md), OSF project pages (observed)
- **Last updated:** 2026-06-18

## Headline

A study in this tool currently has no *outside face*: the moment data collection ends, it stays a Builder document. There is no representation of a **finished study as an artifact** — an abstract, method, result, data pointer, and links a third party can read, cite, and compare. That single gap is what makes Browse feel like rifling a filing cabinet (raw protocol blocks, no summary), makes "Replicate" semantically shaky (you can replicate a *finding*, but the tool only exposes a *plan*), and pushes researchers back to OSF — whose archival storage is solid but whose *reading and comparison* experience is weak. The product needs a **Study Record**: the structured, citable page a study becomes when its author marks it finished.

## Evidence

- **Open-science norms already structure a study's life into stages** — preregistration (a plan), data collection, results, and a citable deposit (DOI). Our lifecycle models the first two well (preregister, run) but stops short of the citable artifact. The replication-crisis literature that grounds [researcher-tooling-pain-points](researcher-tooling-pain-points.md) treats the *shareable, comparable record* (not the raw protocol) as the unit researchers reason about when deciding what to trust or re-run.
- **Replication targets a result, not a protocol.** A direct replication asks "does this *finding* hold?" — which presupposes the original produced one. Today Replicate is allowed on any frozen version (including a bare preregistration), so the affordance can fire when there is nothing to replicate yet. The [burned-replicator persona](../../02_product/personas/burned-replicator.md) is the sharpest voice here: her trust hinges on *seeing the original's result + method together* before committing to re-run it.
- **OSF is the archive, not the face.** OSF gives a DOI and durable storage, but its project pages are file-and-wiki oriented; scanning ten studies to compare designs/results is painful. Researchers told us (synthetic pilot, via [researcher-tooling-pain-points](researcher-tooling-pain-points.md)) that the friction isn't *storing* work, it's *finding and comparing* prior work. A good reading surface in our app, with OSF as the canonical store behind it, is complementary rather than duplicative.
- **Comparability requires structure.** Free-form pages don't compare. A record assembled from *consistent, bound sections* (method from the protocol, result from the data, replication lineage from the fork graph) lets a browser scan many studies on the same axes — which is exactly what discovery filters (tags, replication-allowed, country, language, preregistered) become useful *for*.

## What this implies for the product

- **A new terminal-ish lifecycle state, "Finished,"** plus a clear CTA to enter it (the moment data collection is done). Marking finished is also the doorway to composing the Record. Affects ADR-0044 (make-live / version lifecycle).
- **A Study Record artifact** — bound sections (method, results, data, preregistration, replication lineage, preview link) + authored sections (abstract, results narrative, article DOI, custom content). This is what Browse should land on, not the Builder. New ADR (0054).
- **Replicate is gated to Finished; Template covers the rest.** Resolves the "replicate a plan" confusion (relates to ADR-0018 / ADR-0039).
- **Discovery expands** — search over title/abstract/method, plus filters for replication-allowed, has-preregistration, participant country, and language. New ADR (0055).
- **OSF integration reframes** from "push a prereg snapshot" to "our Record is the readable face; OSF holds the citable artifact; sync key fields both ways" (extends the existing registry adapter; rides the deferred OSF-OAuth work).
- **PII boundary holds (ADR-0014):** any publicly browsable data is aggregate/derived only — never raw participant records.

## What this insight does NOT tell us

- The *priority order* of Record sections, or how much of each a typical reader actually wants — needs a lightweight content-priority test once a wireframe exists.
- **How much result/data to expose publicly** vs. workspace-only — a norms + safety question (some fields embargo data pre-publication).
- Whether full-text search needs dedicated infra (Postgres FTS vs. an external search service) at our scale — an architecture spike, not a research question.
- Whether researchers will actually *maintain* a composed Record vs. wanting it fully auto-generated — would lift confidence to high with usability sessions on the composer.

## Sources

Core:
- [researcher-tooling-pain-points](researcher-tooling-pain-points.md) — the find/compare/trust friction this addresses.
- [persona-segmentation-and-strategic-risks](persona-segmentation-and-strategic-risks.md) — which segments care about a citable, comparable record.

Supporting:
- [burned-replicator persona](../../02_product/personas/burned-replicator.md) — the replication-trust angle (result + method visible before re-running).
- OSF project pages (observed 2026-06-18) — archival-strong, reading/comparison-weak; basis for the "face vs archive" framing.
