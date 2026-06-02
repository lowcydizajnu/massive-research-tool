# Registry integration entities

> **Status:** sketch → V1.5 migration. Implements the data-model additions in [ADR-0005](../adrs/0005-osf-integration.md) (push-to-OSF via a registry-agnostic adapter).
>
> **Date:** 2026-06-02
> **Related:** [ADR-0005](../adrs/0005-osf-integration.md), [ADR-0004](../adrs/0004-preregistration-amendments.md), [ADR-0007](../adrs/0007-path-a-vs-b.md), [05_app/server/adapters/registry.ts](../../05_app/server/adapters/registry.ts)

## Purpose

Back the `RegistryAdapter` (OSF first, registry-agnostic) with: per-user OAuth connections, an append-only push audit trail, and push-status fields on `ExperimentVersion`. Per ADR-0005: push is **per-user** (personal OSF identity), **async** (Inngest), **default-on/opt-out per registration**, and **failures flag the version honestly, never block preregistration**.

## Implementation decisions
- **ULID `text` PKs** for the new tables; FK to `experiment_version.id` is `uuid` (same mixed-id pattern as [04-response-conditioning-entities.md](04-response-conditioning-entities.md)) and to `user.id` is `uuid`.
- `pgEnum` for the status fields.
- **OAuth tokens encrypted at rest** — `access_token`/`refresh_token` are stored ciphertext (AES-256-GCM via a server-side key env var); the adapter encrypts on write, decrypts on use. The DB never holds plaintext tokens.

## New fields on `experiment_version`
| Field | Type | Notes |
| --- | --- | --- |
| `registry_push_status` | enum | `not_pushed` / `pending` / `pushed` / `failed` / `no_credentials` / `opted_out`; default `not_pushed`. Denormalized from the latest `registry_push`. |
| `registry_push_attempts` | int | default 0 |
| `registry_push_last_error` | text? | last failure reason (surfaced in the Preregister banner) |
| `external_registration_doi` | text? | OSF DOI after a successful push (pairs with the existing `external_registration_url`) |

## Entities

### registry
The registry catalogue (V1: one row, `osf`). Like the module registry, the concrete config can live in-repo + be seeded; the row exists so connections/pushes FK to a stable id.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `key` | text | `osf` / `aspredicted` / … (unique) |
| `name` | text | display |
| `oauth_config` | jsonb | non-secret OAuth endpoints/scopes (client secret stays in env) |
| `push_config` | jsonb | adapter-specific push settings |
| `created_at` | timestamptz | |

### registry_connection
Per-user OAuth connection to a registry.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `user_id` | uuid FK → user | |
| `registry_id` | text FK → registry | |
| `access_token` | text | **encrypted** |
| `refresh_token` | text? | **encrypted** |
| `scopes` | jsonb | string[] |
| `connected_at` / `last_refreshed_at` / `revoked_at` | timestamptz | revoked_at set on disconnect (does NOT delete already-pushed OSF registrations) |

Unique `(user_id, registry_id)` for active (non-revoked) connections.

### registry_push
Append-only audit trail — one row per push attempt (incl. retries + failures).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `experiment_version_id` | uuid FK | the version being pushed |
| `registry_id` | text FK → registry | |
| `status` | enum | `pending` / `pushed` / `failed` |
| `request_payload` | jsonb | what we sent (JSON snapshot + template fields) |
| `response_payload` | jsonb? | registry response |
| `error_text` | text? | |
| `pushed_doi` / `pushed_url` | text? | on success |
| `created_at` / `completed_at` | timestamptz | |

## Flow (per ADR-0005)
Preregister click → write the immutable `kind: preregistered` version locally (returns immediately) → enqueue an OSF-push **Inngest** job (BackgroundJobAdapter) → job builds the payload (JSON snapshot + rendered PDF + OSF template-field mapping + ADR-0003 frozen materials), calls `RegistryAdapter.pushRegistration` → on success store DOI/URL + set `registry_push_status='pushed'`; on failure after retries set `'failed'` + `registry_push_last_error` (version stays valid). Amendments (ADR-0004) → `pushAmendment(version, priorDoi)` as a new OSF registration referencing the prior DOI.

## Deferred
- The **PDF render pipeline** (ADR-0005 principle 5) — the human-readable preregistration PDF. V1.5 can push JSON + template fields first; PDF is a fast-follow.
- AsPredicted / ClinicalTrials.gov adapters (same interface; future ADRs).
- `withdraw(doi, reason)` wired to UI (interface method exists; UI later).
