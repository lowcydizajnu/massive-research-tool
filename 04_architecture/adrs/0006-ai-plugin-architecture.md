# ADR 0006 — Task-based AI architecture with provider adapters

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** ai, plugin-architecture, schemas-first, privacy, cost-model, data-model

## Context

Per the product brief decision §2 (resolved 2026-05-27), AI is **V1 architecture-ready, V2+ feature-bearing**. V1 ships with no user-facing AI features. The V1 architecture must include the seams where future AI features will land — authoring assistance, article ingestion (extracting procedure + materials from uploaded papers), conversational survey rendering (chatbot mode), descriptive analytics on the dashboard, methodology critique — without forcing any of them to ship.

The persona-segmentation insight (`01_research/insights/persona-segmentation-and-strategic-risks.md`) confirms AI is expected as a future surface but not in V1: across all three synthetic-pilot personas, the values they want from AI differ (Hanna wants authoring shortcuts; Marek wants attestation / quality validation; Sofia wants no AI at all in the trust-critical path). The architecture must support per-feature, per-tenant routing rather than imposing a uniform AI experience.

This ADR specifies the substrate. It deliberately commits to no AI features. It commits to the abstractions — Tasks, AIProviderAdapters, schemas-first validation, audit trail, per-tenant metering, privacy routing — so future ADRs adding specific features land cleanly.

## Options considered

### Option A — Lightweight gateway, raw prompts

A single AI Gateway service abstracts model providers. Each AI feature composes prompts directly and calls the gateway. The gateway handles routing, rate limits, cost tracking, and an audit log of every invocation. No formal Task concept.

- **Pros.** Simplest to ship. Each feature is autonomous.
- **Cons.** Without tasks as a first-class concept, evaluation is sloppy — no shared structure for "what good output looks like." Model-swap is invasive (every feature's prompt likely needs adjustment). Hard to enforce schemas-first validation consistently. Doesn't honor the architectural rigor committed to elsewhere (ADR-0001's schemas-first, ADR-0005's adapter pattern).

### Option B — Task-based architecture with provider adapters (chosen)

AI calls are first-class **Tasks** — typed operations with declared input and output schemas and prompt templates owned by the feature that invokes them. **AIProviderAdapters** abstract the model layer (commercial APIs, BYO-key, local models, opt-out), mirroring the **RegistryAdapter** pattern from ADR-0005. A gateway routes task invocations to the appropriate provider based on tenant / feature / task preferences. Outputs are validated against module schemas per the schemas-first principle from ADR-0001. Audit log per invocation; cost metered per tenant.

- **Pros.** Schemas-first directly enables AI without quality risk. Provider flexibility addresses privacy. Per-tenant cost metering reuses ADR-0003's infrastructure pattern. Audit log mirrors ADR-0005's `registry_push`. Task definitions are reviewable artifacts. Same shape across the codebase ("adapter" pattern for external-dependency surfaces).
- **Cons.** Upfront design work to commit to the Task abstraction. Schema discipline adds friction.

### Option C — Full agentic / multi-step workflows

Everything in Option B, plus first-class multi-step orchestration (LangGraph / Pydantic AI / similar). Tasks chain, branch, loop. Tool calling and planning supported.

- **Pros.** Where the world is going for sophisticated AI features. Enables "AI synthesis of papers" properly.
- **Cons.** Heavy orchestration infrastructure for V1 architecture-readiness when we ship zero features. Agentic frameworks are evolving fast; committing now risks rewriting in twelve months. Layers cleanly *on top of* Option B's task substrate when a real agentic feature is ready (V3+).

## Decision

**We will adopt Option B: a task-based AI architecture with provider adapters, schemas-first output validation, per-tenant routing, audit logging, and metering. No AI features ship in V1; the architecture is ready for V2+ features to plug in.**

### The ten load-bearing principles

1. **Tasks are first-class typed operations.** A Task declares: an input schema, an output schema, a prompt template, a default provider preference, evaluation rules. Feature code invokes `tasks.<taskName>(input)` and gets a validated output back or a typed error. Prompts are implementation details of the task, not scattered across feature code.
2. **AIProviderAdapter interface mirrors RegistryAdapter (ADR-0005).** Methods include `connect(credentials)`, `invoke(task, input)`, `stream(task, input)`, `estimate_cost(task, input)`. V1 ships the interface and at least one stub adapter; real adapters (OpenAI, Anthropic, local) come with the first V2 features that use them.
3. **Schemas-first output validation is mandatory.** Every Task's output schema is a Zod / JSON Schema definition; AI output is validated against it before being returned to feature code. Validation failure triggers a typed retry with a "fix-your-output" prompt; persistent failure surfaces as an error, never silently returns invalid data. **This is the single biggest win this ADR captures** — because every Module already has a schema (ADR-0001), AI-generated content is structurally validated by the same machinery.
4. **Per-tenant provider routing.** Each Tenant has an `ai_routing_policy` that maps task categories (`authoring_assist`, `extraction`, `critique`, `conversation`, …) to provider preferences. Default ships with sensible commercial-API defaults. Tenants can override to BYO-key, local-only, or opt-out per category. The opt-out state means the feature is unavailable for that tenant, not that the platform substitutes a worse provider.
5. **Per-tenant cost metering from day one.** AI invocations are metered against a `TenantAIMeter` row tracking spend, token counts, and per-category breakdowns. Same pattern as ADR-0003's `TenantStorageMeter`. Pricing model deferred to a separate decision; the architecture supports any pricing strategy we later commit to.
6. **Append-only audit log per invocation.** Every Task invocation creates an `AIInvocation` row with the prompt, model, response, cost, latency, validation result, and any retries. Same pattern as ADR-0005's `RegistryPush`. Enables debugging, evaluation, abuse detection, and (critically) the kind of transparency Sofia's segment expects — "show me what the AI did."
7. **Human-in-the-loop is the default UX pattern.** AI outputs are presented as suggestions for human review/edit/reject, not as actions the system takes. This isn't enforced at the architecture level (a future automation feature might bypass it), but the UX convention starts here. The persona-segmentation insight makes this clear: the burned-replicator segment will reject any AI that acts opaquely.
8. **Caching by content-hash for deterministic tasks.** Tasks declare whether they're deterministic (same input → same output). For deterministic tasks, a content-hash cache short-circuits invocations. Useful especially for article extraction (the same uploaded paper shouldn't re-extract) and methodology critique on stable designs.
9. **Async + streaming both supported.** Some V2 tasks are user-blocking and benefit from streaming (authoring assist while user types, chatbot conversations). Others are background and benefit from async + Inngest (article extraction, batch critique). The gateway supports both patterns; the Task declares its preferred mode.
10. **Privacy-sensitive content is opt-in for commercial providers.** Tenants whose `ai_routing_policy` allows commercial APIs accept that experiment definitions, participant data summaries, etc. may pass through OpenAI/Anthropic infrastructure. Tenants on a local-only policy never have content leave our infrastructure. The Task interface carries a `data_sensitivity` tag so a content-aware policy can refuse routing for high-sensitivity tasks regardless of tenant policy.

### What V1 ships (architecture-only)

- The `Task` interface (TypeScript + Zod schema definitions).
- The `AIProviderAdapter` interface.
- A stub adapter (returns a canned response) for testing the substrate without real API calls.
- The gateway: routing, content-hash cache, audit log writes, metering.
- Three data-model entities: `AIProvider`, `AIProviderConnection`, `AIInvocation`, plus `TenantAIMeter`.
- Tenant `ai_routing_policy` field.
- No Task definitions yet (those come with the first V2 feature).
- No real provider adapters wired up (those come with the first V2 feature that uses them).

### Sketch of the data-model additions

Full entry in a future `04_architecture/data-model/03-ai-integration.md`:

```
ai_provider
  id, key ('openai' | 'anthropic' | 'local' | 'stub' | ...), name,
  oauth_config json (nullable — BYO-key providers use OAuth or API-key per tenant),
  api_key_config json (for direct-key providers), default_models json,
  created_at

ai_provider_connection
  id, tenant_id FK, ai_provider_id FK,
  credential_kind enum ('platform_managed' | 'byo_key' | 'oauth'),
  encrypted_secret (nullable), oauth_tokens (nullable encrypted),
  configured_models json, connected_at, last_used_at, revoked_at

ai_invocation  (append-only audit + analytics)
  id, tenant_id FK, ai_provider_id FK,
  task_key string, task_version string,
  input_payload json, output_payload json (nullable),
  validation_status enum ('valid' | 'invalid' | 'retried' | 'failed'),
  validation_errors json (nullable),
  prompt_text text, model_name string,
  input_tokens int, output_tokens int, cost_usd numeric,
  latency_ms int, streamed boolean,
  cache_hit boolean,
  status enum ('success' | 'provider_error' | 'validation_failed' | 'opted_out' | 'rate_limited'),
  error_text (nullable),
  created_at, completed_at

tenant_ai_meter
  tenant_id PK, total_invocations int, total_cost_usd numeric,
  by_category json (rollup of cost/count per task category),
  last_calculated_at

tenant  (extends — sketched per ADR-0006-vs-future ADR-0007 tenancy model)
  ai_routing_policy json (per-category provider preferences + sensitivity caps)
```

### Task category taxonomy (initial)

Used by routing policy and metering rollups. Extensible; new categories are a code change, not a schema migration.

- `authoring_assist` — suggestions while building (V2)
- `extraction` — pull structured data from documents (V2-V3)
- `critique` — methodology / design / data review (V2-V3)
- `conversation` — chatbot survey rendering, dialog-mode interactions (V2-V3)
- `analytics` — descriptive interpretations on dashboard (V2)
- `accessibility` — alt-text generation, plain-language renders (V2-V3)

### Privacy / sensitivity tags on Tasks

Each Task declares a `data_sensitivity` tag drawn from:

- `metadata_only` — only experiment titles, descriptions, structure (no participant data).
- `experiment_definition` — full experiment, materials, configurations (researcher work but not participant responses).
- `participant_data` — anonymized or aggregated participant responses (sensitive).
- `pii` — personally-identifiable info (the strictest; many tenants will refuse routing).

The gateway enforces tenant policy against task sensitivity. A `participant_data` task on a tenant with `commercial_apis_for_participant_data: false` refuses the invocation rather than silently downgrading.

## Consequences

**What becomes easier:**

- New AI features (V2+) ship as a new Task definition + minor feature glue, not a new architecture.
- Schema-validated outputs eliminate a huge class of "the AI hallucinated invalid module data" bugs.
- Switching model providers (cost reasons, quality reasons, new model release) is a tenant-policy change, not a code rewrite.
- Audit trail is structural — supports debugging, compliance, and the transparency the burned-replicator segment expects.
- Cost-control surfaces (alerts when a tenant exceeds budget, per-category breakdowns) work uniformly across all AI features.

**What becomes harder:**

- Every new AI capability requires a Task definition with schemas and a clear input/output contract. More upfront discipline than "just send a prompt."
- Stub-and-test infrastructure for the AI substrate adds engineering work in V1 even though no features ship.
- Maintenance of provider adapters tracks upstream API changes (same operational pattern as ADR-0005's registry adapters).
- Streaming + async + sync invocation patterns all need to work; the gateway is non-trivial.

**What we are now committed to:**

- Tasks as first-class typed operations with schemas.
- AIProviderAdapter interface.
- Schemas-first validation of all AI outputs.
- Per-tenant routing with sensitivity-aware policy enforcement.
- Append-only `ai_invocation` audit trail.
- Per-tenant metering with category rollups.
- Human-in-the-loop as the default UX pattern.

**What we are now precluded from:**

- AI calls that bypass the Task abstraction (no inline `openai.chat.completions.create(...)` in feature code).
- Silent provider fallback that ignores tenant policy.
- AI outputs that haven't been validated against a declared schema.
- Hidden AI invocations missing from the audit log.
- Synchronous, blocking AI calls when the user is mid-flow (must use streaming or async with progress indication).

## Revisit triggers

Reopen this decision if:

- **Agentic / multi-step orchestration becomes a clear V2 need.** Option C territory. Sketch: a new `Workflow` abstraction on top of Tasks. Layerable.
- **Fine-tuning or custom models become a real ask.** Probably a new entity (`AIModel` with its own lifecycle and ownership).
- **Latency requirements for streaming get tight enough that the gateway adds unacceptable overhead.** Direct-routing path with relaxed audit semantics could be an escape hatch (but should be deeply justified).
- **A regulatory regime (HIPAA, GDPR-strict, EU AI Act) requires routing controls we didn't anticipate.** Sensitivity-tag system was designed with this in mind; adjustments may still be needed.
- **Token-budget gaming becomes a problem at scale.** Per-tenant rate limits and budget enforcement may need to move from soft (alerts) to hard (rejection).

## References

- ADR-0001 — modular composition + theme overlays — schemas-first principle that this ADR applies to AI output validation.
- ADR-0002 — forking model — AI-generated drafts of new versions become regular `kind: autosave` versions; nothing AI-specific in the versioning model.
- ADR-0003 — asset storage — per-tenant metering pattern this ADR mirrors.
- ADR-0005 — OSF integration — RegistryAdapter pattern this ADR mirrors with AIProviderAdapter.
- `02_product/product-brief.md` §2 (AI: V1 architecture-ready, V2+ feature-bearing) — the originating decision.
- `01_research/insights/persona-segmentation-and-strategic-risks.md` — segment-dependent AI receptiveness (Hanna wants assist; Marek wants quality validation; Sofia wants no opaque AI).
- `STACK.md` — Inngest for async tasks; the same machinery for AI background jobs.
- Future: `04_architecture/data-model/03-ai-integration.md` — full entry for AIProvider, AIProviderConnection, AIInvocation, TenantAIMeter.
- Future: ADR-00NN — first V2 AI feature (likely authoring assist) — tests whether the Task abstraction held.
- Future: ADR-00NN — agentic workflow layer (Option C) when sophisticated automation becomes real.
