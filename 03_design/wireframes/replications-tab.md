# Wireframe spec — Replications tab + Replicate affordance

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md) (seeing who replicated her work) + [Browse frameworks](../../02_product/user-flows/browse-frameworks.md) (replicating to adapt).
- **IA placement:** [Information architecture](../ia/information-architecture.md) §"Forks placement (v0.3)" — forks are a relationship surfaced in three places; this is the parent study's right-panel **Replications** tab (two-directional family + divergence).
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md) (the original author) + [Sofia](../../02_product/personas/postdoc-operator.md) (the replicator).
- **Status:** draft

## Purpose

Surface a study's **replication family** — its parent (if this study is itself a fork) and its children (studies that forked it, possibly in other workspaces) — with a **block-level divergence** summary, plus the affordances to **Replicate** a study and set its **forkability** (Private ↔ Public-replicable). This is the "GitHub for research" lineage made legible. Builds on ADR-0018 (cross-workspace forking + the withheld-diff privacy rule) and ADR-0002 (snapshot forking + `forkable_by`).

## Layout

Lives in the Build stage's right context panel (build-stage-builder-mode.md), as the **Replications** tab alongside Details / Configure. Selecting it (no block selected) swaps the panel body to the replications view. The **Replicate** button + the **forkability** control live in the Details panel (the study's "at a glance" metadata).

## Content inventory

- **Forkability control (Details):** a small Private ↔ Public-replicable toggle (owner only) → `studies.setForkable`. Copy: "Public-replicable — others can replicate this study."
- **Replicate button (Details):** "Replicate this study" → `studies.fork` → routes to the new fork's Build stage. Present on any study the caller can open.
- **Replications tab body:**
  - **Parent block** (when this study is a fork): "Replicating {parent title} by {author}" + a divergence line ("You changed N blocks, added N, removed N") linking to the parent. If the parent's protocol isn't visible (private, other workspace), show the lineage line without the diff.
  - **Children list:** each replication — "{title} by {author}" + a divergence summary chip (`+N` added, `−N` removed, `~N` changed, `=N` unchanged) **or** "Private replication — divergence hidden" when withheld (ADR-0018). Count in the tab header ("Replications · N").
  - **Empty state:** "No replications yet. When someone replicates this study, it shows up here."

## States

- **Forkability:** private (default) · public-replicable. Toggling is optimistic + persists.
- **Replications:** has-family (parent and/or children) · empty · loading · error (inline alert).
- **Withheld diff:** a child the caller can't see renders count + author + title, divergence replaced by "divergence hidden."
- **Replicate:** idle → pending (button busy) → routes to the fork on success; FORBIDDEN (not public + not a member) surfaces inline ("This study isn't open for replication").

## Interactions

- **Replicate** — `studies.fork({studyId})`; on success navigate to `/studies/{newId}/build`.
- **Set forkability** — `studies.setForkable({studyId, forkableBy})`; invalidates the study.
- **Open Replications tab** — `studies.getReplications({studyId})`.
- **Click a family member** — navigates to that study (if the caller can open it).

## Edge cases

- **Cross-workspace child, private:** counted + named, divergence hidden (no protocol leak).
- **Replicating your own study:** allowed (fork within your workspace); the `fork` event excludes you as the actor so you don't self-notify.
- **Diff alignment:** forks preserve block `instanceId`s, so "changed" means the same block was edited; a re-added block with a new id reads as removed+added (acceptable).
- **Nothing to replicate:** a study with no version yet → Replicate is a no-op / disabled.

## Accessibility notes

- The Replications tab is part of the right-panel `tablist` with `aria-selected`; the body is a labelled region.
- Divergence chips pair the symbol with text ("3 changed"), never color/symbol alone.
- Replicate + forkability are real buttons/controls with accessible names.

## Open questions

- **Two-directional family tree visual** (IA "two-directional family tree") — V1.7 ships a flat parent + children list; the tree visualisation is a fast-follow.
- **Forks on the study card + Activity** (the other two IA placement points) — the card "Replicating" subtitle exists; a replication count on the card is a fast-follow.
- **Pull-from-upstream** — out (ADR-0002 deferred).
