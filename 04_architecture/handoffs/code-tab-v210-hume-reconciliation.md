# V2.1 Hume handoff — reconciliation against the real codebase (2026-06-25)

> Companion to [`code-tab-v210-hume-emotion-ai.md`](code-tab-v210-hume-emotion-ai.md). The handoff was drafted assuming a "V2.0 substrate already shipped." This note checks that handoff's concrete assumptions (tables, adapters, routers, ADR numbers, block layout, file paths) against what is actually in the repo today. **No code changed.** Read this *before* opening the H1/H2 phase gate — several foundational premises are wrong and they change the estimate.
>
> Verified by direct inspection of `05_app/server/db/schema.ts`, `server/adapters/`, `server/trpc/routers/ai.ts`, `server/modules/registry.ts`, `04_architecture/adrs/`, and the route tree, on 2026-06-25 (latest migration = `0035`, latest ADR = `0065`).

---

## The one big correction: the "V2.0 substrate" does not exist

The handoff's central premise — *"While this handoff was being drafted, Code tab shipped ADR-0061 + the V2.0 substrate … `ai_invocation` audit table; sensitivity-tag routing; per-tenant metering … V2.1 extends this substrate"* — is **largely false**. What actually shipped (ADR-0061, the `ai-chat` block) is a **thin** BYO-key + single-turn-chat path. The richer substrate ADR-0006 *designed* was never built.

Concretely, **none of these exist**:

| Handoff assumes exists | Reality |
|---|---|
| `ai_invocation` audit table (+ `ai_invocation_payload` sidecar) | **Not in schema. No migration. Nowhere in the repo.** |
| Per-invocation `cost_usd` metering | Does not exist → no spend tracking substrate at all |
| Task abstraction / schemas-first validation / audit log (ADR-0006 Option B) | Never built; ADR-0061 shipped without it |
| `AIProviderAdapter` rich enough to `extends` for Hume | Interface is **`validateKey(apiKey)` + `chat(input)` only** (`server/adapters/ai.ts`) |

**Impact.** H2 ("additive columns on the V2.0 `ai_invocation` table") is actually a **new-table migration + a new metering layer built from zero**. The $50/mo cap, usage dashboard, and 80% warning (H8c; owner-locked #4/#9) have **no substrate** — all net-new. H1/H2 are materially bigger than "extend what's there."

**Decision the owner/Code-tab must make before V2.1 starts:**
- **(a)** Build the ADR-0006 Task substrate first (audit table + per-invocation metering + schemas-first task layer) as a genuine prerequisite slice — then V2.1 "extends" as the handoff imagines; **or**
- **(b)** Continue the thin-adapter pattern ADR-0061 set, and fold `ai_invocation` + metering into V2.1 scope explicitly (raises the H1/H2 estimate).

Either is defensible, but the handoff currently assumes (a) is *done*. It is not.

---

## High-severity: wrong identifiers & paths (will mislead the builder)

1. **Connection table is `ai_provider_connection`, not `ai_connection`.** The handoff's H1 `CREATE TABLE ai_connection (…)` does not match the real table (`schema.ts:553`). Real columns:
   `id` (ULID text) · `workspace_id` · `user_id` · `provider` · `api_key` (encrypted; **not** `encrypted_api_key`) · `key_hint` · `status` · `last_error` · `created_at` · `updated_at`.
   There is **no** `encrypted_secret_key`, `encrypted_webhook_signing_key`, `connected_by_user_id`, `connected_at`, or `last_used_at`. The provider CHECK is `('anthropic', 'openai')`. So "add a `hume` row to the enum + nullable secret/webhook columns" = **a real migration (next = `0036`)** that extends the CHECK and adds three columns, not a no-op.

2. **ADR numbers are wrong.**
   - Handoff cites **"ADR-0014 — PII boundary"** and proposes an "ADR-0014 amendment — biometric-data lifecycle." Reality: **ADR-0014 = "Response data model + minimum viable conditioning."** There is **no dedicated PII-boundary ADR**; sensitivity/privacy routing is sketched in **ADR-0006** ("Task-based AI architecture"). The "Files to read" entry `0014-pii-boundary.md` **does not exist**.
   - Correct targets for the biometric-lifecycle work: amend **ADR-0006** (privacy/sensitivity routing) and **ADR-0014** (response + withdraw cascade) — but cite them by their real titles, or write a fresh ADR.
   - **Next available ADR number is `0066`, not `0061`.** Taken: 0061 ai-chat, 0062 document-extraction, 0063 workspace-templates, 0064 workspace-materials, 0065 ai-chat-appearance. The handoff's "current next-available is ADR-0061" is five behind.

3. **Block file layout is wrong — there is no `components/blocks/` directory.** Blocks are **registry entries** in `server/modules/registry.ts` (`key` + `source: "core"` + `version`), rendered through take-side overrides under `components/feature/take/` and configured via panels under `components/feature/builder/`. The handoff's `05_app/components/blocks/audio-record/`, `…/free-text/`, etc. do not exist. Adding the 4 new Hume blocks = **registry entries + take/results/configure components + a manifest entry**, not new `components/blocks/<kind>/` folders.

4. **`core/long-text` block does not exist.** The registry has `free-text` (@1.0.0), `text`, `social-post` (@2.0.0 ✓), `audio-record` (@1.0.0 ✓), `video-record`, `video`. "Long text" is a free-text variant, not a separate module. Drop `core/long-text` from H4a's eligible-block list.

5. **`study_publish_acknowledgment` table does not exist.** The handoff says it "already exists since V1.12 mimicking-presets" and reuses it for IRB acks (H6/H7c). Reality: the mimicking acknowledgment is stored **in the theme JSON** (`mimicAcknowledged: true`), not a table. **All IRB-ack persistence in V2.1 is net-new** — it needs its own table (or a documented, validated JSON location) and should be scoped accordingly.

---

## Medium-severity: location/naming drift (buildable; fix the doc)

6. **AI keys are workspace-scoped, not "Settings · Account → AI Connections."** Real UI: [`components/feature/settings/ai-provider-settings.tsx`](../../05_app/components/feature/settings/ai-provider-settings.tsx) rendered under **Settings · Workspace** (`app/(app)/(workspace)/settings/workspace/page.tsx`). The router is **`ai.connections`** (`server/trpc/routers/ai.ts`) with **`list` / `connect` / `disconnect` only** — there is **no `test`/`ping`** and **no `usage`** procedure. Hume's connect-test and usage rollup are net-new procedures.

7. **OSF connect path is wrong.** Handoff: `app/(account)/account/integrations/page.tsx` — does not exist. OSF surfaces live at `(app)/(personal)/settings/account/page.tsx` and study-level (preregister/results). The Prolific path is roughly right but the route group is `(app)/(workspace)`: `app/(app)/(workspace)/participants/connections/page.tsx`.

8. **Crypto path:** it's `server/crypto/tokens.ts` (`encryptSecret`), **not** `lib/crypto/token-encryption.ts`. The `TOKEN_ENCRYPTION_KEY` discipline (ADR-0016) does hold.

9. **R2 storage:** the real file is `server/adapters/storage.r2.ts` (interface in `storage.ts`). The handoff inconsistently cites `server/storage/r2.ts` in one place; use the adapter path.

10. **No `server/workers/withdraw-participant.ts`.** Withdraw logic lives in `server/trpc/routers/studies.ts` (+ OSF in `registry.osf.ts` / `server/jobs/osf-watch.ts`). The ADR-0014 withdraw-cascade extension targets those, not a non-existent worker.

---

## What the handoff got right (assumptions that hold)

- **`ai_provider_connection` exists** with the BYO-key, AES-256-GCM-at-rest, masked-hint pattern the handoff describes (just under different column names) — the connect/disconnect UX is a real precedent to mirror.
- **Adapter discipline (ADR-0007) is real and enforced:** `ai.anthropic.ts` confines the vendor SDK; `ai.hume.ts` confining `@hume/*` fits the existing pattern exactly.
- **Inngest job substrate exists** — `server/adapters/jobs.inngest.ts` + `server/jobs/{notification-fanout,osf-watch,registry-push,recruitment}.ts`. H3a's "post-submit Inngest job" pattern is viable; model `hume.analyze-voice` on `server/jobs/registry-push.ts`.
- **`core/social-post@2.0.0`** version matches; **`audio-record@1.0.0`** and **`free-text@1.0.0`** exist as emotion-eligible blocks.
- **ADR-0006 / ADR-0007 / ADR-0003 / ADR-0016** exist and are about (respectively) AI provider adapters, adapter discipline, asset storage, and deployment — the right things to read, just cite ADR-0006 as *"Task-based AI architecture with provider adapters"* and note its Task model is unbuilt.

---

## Net effect on the plan

- **H1** — bigger than stated: a migration (`0036`) to extend the provider CHECK + add Hume's secret/webhook columns to `ai_provider_connection`, *plus* new `test`/`ping` and `usage` procedures (neither exists). Re-scope from "add a row" to "extend table + grow the router."
- **H2** — much bigger: build the `ai_invocation` table + metering layer from scratch (it is not "additive"), and decide whether to first build the ADR-0006 Task substrate. The `AIProviderAdapter` base must be widened (today it's `validateKey` + `chat`).
- **H6/H7** — the IRB-ack persistence has no existing table to lean on; add that to scope.
- **All streams** — re-path the block work to the registry + `components/feature/{take,builder}` model; drop `core/long-text`; renumber ADRs to `0066+`; retitle the ADR-0014/PII references.

None of this kills the plan — the adapter discipline, BYO-key precedent, and Inngest substrate are genuinely in place. But the handoff should be edited (or superseded) so the H1/H2 estimate reflects "build the AI audit/metering substrate," not "extend it." Recommend doing that edit before opening the first phase gate.
