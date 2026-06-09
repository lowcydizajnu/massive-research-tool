# ADR 0029 — Custom composite modules (saved groups)

- **Status:** accepted
- **Date:** 2026-06-09
- **Deciders:** project owner, Claude (agent)
- **Tags:** blocks, grouping, modules, ADR-0012-related, ADR-0028-related

## Context

Researchers want to save a configured **group** of blocks (e.g. a custom address — street/city/postcode, with some fields removed and others added) as a **reusable named module**, then drop it into other studies. ADR-0028 gives us groups; this turns a group into a reusable template.

## Decision

A **custom module is a saved group**, scoped to the **workspace** (the tenant), stored in a new `custom_module` table — NOT in the global module registry (which stays curated/core, ADR-0008). It is a *template*, not a live link: inserting one **copies** its blocks into the study (fresh instance ids + a fresh group), so later edits to the study don't mutate the saved module and vice-versa (copy-on-insert, like create-from-framework).

- **Storage:** `custom_module { id, tenant_id → workspace, name, definition jsonb, created_by, created_at, updated_at }`. `definition = { title?: string, blocks: SavedBlock[] }` where `SavedBlock = { source, key, version, config, title? }` — the member blocks **without** instance ids, branch rules, or arm gates (those are study-specific and don't travel with a template).
- **Save:** `customModules.saveFromGroup(studyId, groupId, name)` reads the study's group members, strips instance-specific fields, persists the template (write role).
- **List/Delete:** `customModules.list` (workspace-scoped) / `customModules.remove(id)`.
- **Insert:** `studies.insertCustomModule(studyId, customModuleId)` appends the template's blocks to the study as a NEW group (fresh `instanceId`s + a fresh `groupId`, titled from the module), reusing the ADR-0028 snapshot write. Surfaced in the Module Picker under "Your saved modules".

## Consequences

- No change to `definition_snapshot` shape (ADR-0012) — inserted modules are just blocks + a group.
- Templates are workspace-private (tenant-scoped reads/writes); not shared cross-workspace in V1 (a future "publish module" could promote one, mirroring framework sharing).
- A migration adds `custom_module`. No backfill.
- "Why not edit-in-place a shared module instance?" — copy-on-insert keeps studies self-contained + preregistration-safe (a frozen study never shifts because a module was edited later), consistent with frameworks (ADR-0010).

## Options considered

- **Copy-on-insert template (chosen)** — inserting copies blocks with fresh ids; edits never propagate. Self-contained studies, preregistration-safe.
- **Live link (instance references a shared module)** — one edit updates every study using it. Rejected: breaks the frozen-snapshot guarantee (a preregistered study could silently change) and complicates tenancy.
- **Store templates in the global module registry** — rejected: the registry is curated/core (ADR-0008); user templates are workspace-private and shouldn't pollute it.
- **Store in a JSON column on `workspace`** — rejected: a real table is queryable, scopes cleanly, and grows without bloating the workspace row.

## Revisit triggers

- Researchers ask to **share** a saved module across workspaces or publicly → add a "publish module" promotion path (mirror framework sharing) + a visibility column.
- Demand to **edit a saved module** and have studies pick up changes → revisit the copy-vs-link decision (likely a versioned template, not a live link).
- Templates need **parameters/variants** (e.g. an address module with country-specific fields) → extend `definition` beyond a flat block list.

## References

- ADR-0028 — question groups and per-screen runtime (a custom module is a saved group).
- ADR-0012 — `definition_snapshot` block model (inserted modules are just blocks + a group).
- ADR-0010 — frameworks (copy-on-create precedent).
- ADR-0008 — module registry (curated/core; distinct from user templates).
