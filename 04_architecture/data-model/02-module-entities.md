# Module entities

> **Status:** sketch → first migration. Grounds [ADR-0001](../adrs/0001-modular-composition-theme-overlays.md) (module identity + schemas-first) and [ADR-0012](../adrs/0012-block-format-and-autosave-semantics.md) (block format + the seeded core modules). Promotes the brief Module/ModuleVersion sketch from [00-core-entities.md](00-core-entities.md) into the shape the second migration creates.
>
> **Date:** 2026-06-02
> **Related:** [ADR-0001](../adrs/0001-modular-composition-theme-overlays.md), [ADR-0012](../adrs/0012-block-format-and-autosave-semantics.md), [00-core-entities.md](00-core-entities.md), [05_app/server/db/schema.ts](../../05_app/server/db/schema.ts)

## Purpose

Define the module catalogue the Builder picks blocks from. A **Module** is the conceptual identity (a question type / artifact, per ADR-0001's granularity); a **ModuleVersion** is an immutable snapshot carrying the config schema a block instance is validated against. Block instances live in `ExperimentVersion.definition_snapshot` (per ADR-0012) and reference a `(source, key, version)` triple that resolves to a ModuleVersion.

V1 ships a tiny built-in catalogue (`source = "core"`); the plugin path (other sources) is deferred to ADR-0008.

## Where the schema lives — DB row vs. in-repo registry

Per ADR-0001, module **runtime code + the authoritative config schema live in-repo**, keyed by `source/key/version` (`05_app/server/modules/registry.ts` — a map to a **Zod** schema + display metadata + default config). The `ModuleVersion.schema` **column** stores a JSON-Schema representation for record-keeping and querying ("which modules have field X?"). The two are kept consistent at seed time.

- **Write-time validation** (block add/config edit) uses the **in-repo Zod** schema (ADR-0012's write-boundary guard).
- The **DB row** is the queryable catalogue + the durable record of what a version's schema was.

## Module

The conceptual identity. Exactly one `core/social-post` exists, across all its versions.

| Field | Type | Description |
| --- | --- | --- |
| `id` | uuid PK | |
| `source` | text | Identity namespace. V1: always `"core"`. Future: `"plugin:…"`. |
| `key` | text | Kebab-case identifier within source (e.g., `social-post`, `likert-7`). |
| `name` | text | Display name. |
| `description` | text | Short purpose (shown in the module picker). |
| `category_tags` | jsonb (string[]) | For picker grouping / theme filtering (e.g., `["misinformation","stimulus"]`). |
| `created_at` | timestamptz | |

**Invariants:** `(source, key)` unique; `key` matches `^[a-z][a-z0-9-]*$`; `source` matches `^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$`. No `tenant_id` — modules are platform-level in V1.

## ModuleVersion

An immutable version of a Module. Carries the config schema.

| Field | Type | Description |
| --- | --- | --- |
| `id` | uuid PK | |
| `module_id` | uuid FK → Module | |
| `version` | text | Semver, e.g. `1.0.0`. |
| `name` | text | Display name at this version (denormalized for catalogue reads). |
| `schema` | jsonb | JSON-Schema representation of the config (the authoritative runtime schema is the in-repo Zod keyed by `source/key/version`). |
| `default_config` | jsonb | The config a freshly-added block instance starts with (valid against `schema`). |
| `changelog` | text | What changed from the previous version. |
| `is_breaking` | boolean | True for major bumps (stored for query convenience). |
| `deprecated_at` | timestamptz (nullable) | When deprecated; still resolvable for existing studies (ADR-0001 fork-safety). |
| `created_at` | timestamptz | |

**Invariants:** `(module_id, version)` unique; `version` is semver; `schema` immutable once created (a new schema is a new ModuleVersion); deprecated versions remain resolvable.

**Relationship to studies:** referenced by `ExperimentVersion.module_version_locks` (the derived `(source,key,version)` set) and by each block's triple in `definition_snapshot.blocks` (ADR-0012). Not a relational join in V1 — the reference is the JSON triple, resolved to a ModuleVersion row at read/validate time.

## Seeded core modules (per ADR-0012)

The migration seeds two, matching the Builder wireframe + the verification page:

- **`core/social-post@1.0.0`** — misinformation **stimulus**. Config (sketch): `headline` (string, required), `body` (string), `source` (string), `imageUrl` (string url, optional), `shareCountVisible` (boolean). Tags: `["misinformation","stimulus","social"]`.
- **`core/likert-7@1.0.0`** — 7-point **Likert** manipulation check. Config (sketch): `prompt` (string, required), `leftAnchor` (string), `rightAnchor` (string), `required` (boolean, default true). Tags: `["measurement","manipulation-check"]`.

Exact field schemas are authored as Zod in the registry; the seed stores their JSON-Schema form + `default_config`.

## Deferred

- **Plugin sources** (`source != "core"`) + a `Plugin` table — ADR-0008.
- **Migration functions** (`ModuleVersion.migration_to_next`) for upgrading instance data across breaking versions — when the first breaking core bump happens.
- **Join table** for "which studies use module X" — promote from the JSON triple when that query is frequent (likely V2, per 00-core-entities.md §1).

## Open questions

1. **Schema source of truth long-term** — duplicating Zod (in-repo) + JSON-Schema (DB) risks drift. V1 keeps them in sync at seed time; a generator (`zod-to-json-schema`) at build time is the likely hardening if drift bites.
2. **Theme-scoped visibility** — Themes (ADR-0001) declare `visible_modules`; the picker is unfiltered in V1 (only two modules). Wire theme filtering when a theme with a curated module set ships.
