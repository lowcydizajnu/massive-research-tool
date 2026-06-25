# Code tab handoff — V2.1 Hume emotion AI (drafted 2026-06-22 — owner-locked, all 7 open questions resolved)

> ⚠️ **REVISED 2026-06-25 — substrate-first.** This handoff was reconciled against the real repo and edited per owner direction (high-quality, build-it-right). Key changes baked in below: a new **Section H0 — AI substrate** (the `ai_invocation` audit table, write-through metering gateway, widened `AIProviderAdapter` contract, and `ai-chat` retrofit) is now the **first** stream — it was wrongly assumed already shipped; total estimate is now **~14–14.5 weeks** (was 12.5). Identifier/path fixes throughout: table is `ai_provider_connection` (not `ai_connection`); AI keys are workspace-scoped; ADRs renumbered to **0066+** (ADR-0014 *is* the PII boundary — keep the biometric amendment there; just cite its real filename); blocks live in `server/modules/registry.ts` (no `components/blocks/` dir); `core/long-text` and `study_publish_acknowledgment` don't exist. Full gap analysis: [`code-tab-v210-hume-reconciliation.md`](code-tab-v210-hume-reconciliation.md).

> **V2.1 = Hume emotion-AI as an option on existing applicable blocks + four new dedicated blocks.** This is the second AI release after V2.0 (text-LLM substrate: measure picker, literature→blocks, hypothesis extraction). V2.1 introduces a **second AI vendor** with a different sensitivity profile — Hume analyzes voice/text/face emotion and generates emotional audio. Estimated **~12.5 weeks Code-tab time** across 6 PR streams (12 original + 0.5 for the we-manage-EVI-configs work added 2026-06-22). **BYOAI model locked** (researcher provides their own Hume API token; mirrors OSF/Prolific connect pattern).
>
> **Scope-locked 2026-06-22:** none of #3 (Octave TTS) or #4 (EVI conversational interface) is deferred — all four feature families ship in V2.1. Emotion analysis is offered as an OPTION on all existing applicable blocks (any free-text input + any audio record) AND as four dedicated new block kinds.
>
> **Reconciliation 2026-06-22 (substrate already shipped):** While this handoff was being drafted, Code tab shipped **ADR-0061** + the V2.0 substrate (commits `df1fa9f` + `35890fe` + `24392d6`). What now exists in the codebase: `AIProviderAdapter` interface at `server/adapters/ai.ts`; Anthropic adapter `server/adapters/ai.anthropic.ts` (HTTP, key confined per ADR-0007); `ai_provider_connection` table (per-workspace BYO key, AES-256-GCM encrypted, masked on list); `ai.connections` tRPC router (`status` / `connect` / `disconnect`); a workspace-settings card to paste/validate/remove keys; and `ai-chat` block kind queued for the next slice (the text-LLM Claude conversation). **V2.1 extends this substrate** — no need to "land V2.0 first": (a) we add a `hume` row to the existing `ai_provider_connection` provider enum + add nullable `encrypted_secret_key` + `encrypted_webhook_signing_key` columns (Hume needs three keys — API + Secret + Webhook signing); (b) extend the existing `ai.connections` router for Hume; (c) implement `server/adapters/ai.hume.ts`; (d) **rename my proposed `ai-conversation` block to `core/voice-conversation@1.0.0`** to avoid collision with the in-progress `ai-chat` (text) block. The two AI conversation blocks are siblings — `ai-chat` is text-LLM-mediated; `voice-conversation` is Hume EVI voice-mediated with emotion measurement. Different blocks, different modalities, same `AIProviderAdapter` seam.
>
> **All 7 open questions resolved 2026-06-22:** (1) **we manage EVI configs** via Hume's Configs API on the researcher's behalf — one Hume config per `voice-conversation` block instance, mirrored in our DB; (2) **participant raw-audio retention is a per-block toggle** (`'never' | 'session' | 'retained'`) so researchers can match retention to study type (default `'never'`); (3) **10 vetted TTS voice presets** for V2.1 (full picker = V2.2); (4) **$50/mo workspace AI budget default cap** on new workspaces; **owner-overridable per workspace**; existing workspaces get no default; (5) **keep both** `text-emotion-probe` block AND the free-text emotion-analysis option (different cognitive affordances for researchers); (6) **researcher-facing Hume branding** (visible in Builder Configure / Connections list / Results panels); **no participant-facing branding** unless Hume's TOS strongly requires it (pre-ship check, see H7); (7) **workspace-level cost rollup only** — no per-researcher attribution in the Usage dashboard.

V2.1 unblocks **emotion-as-a-measure** for psychological research. Today researchers can collect audio responses (V1.12 `core/audio-record@1.0.0`) and free-text responses (V1.6 `core/free-text@1.0.0`), but the only signal they extract is the raw content + manual coding. V2.1 turns every voice and text response into a structured emotion-vector measure, and adds two new stimulus modalities (emotion-controlled TTS + voice-conversation-with-AI) that are impossible without specialized infrastructure.

---

## Owner-confirmed decisions (locked 2026-06-22)

1. ✅ **BYOAI model.** Researcher connects their own Hume account via PAT in Settings · Account → AI Connections. We never proxy through a shared/managed Hume key. Same pattern as the V1.7 OSF and V1.15 Prolific connect flows.
2. ✅ **Option on existing blocks AND dedicated new blocks.** Both surfaces ship. The option is a checkbox on every applicable existing block; the dedicated blocks are first-class new kinds that put emotion at the center of the response design.
3. ✅ **All four feature families in scope.** Voice emotion (Feature #1) + text emotion (Feature #2) + Octave TTS stimulus (Feature #3) + EVI ai-conversation (Feature #4) all ship in V2.1. No deferrals.
4. ✅ **Adapter discipline holds.** No `@hume/*` import outside `05_app/server/adapters/ai.hume.ts` per ADR-0007.
5. ✅ **Sensitivity tier respects ADR-0006 + ADR-0014.** Voice = `pii` (biometric); text = `participant_data`; face = explicitly out-of-scope for V2.1 (no video capture today; revisit V2.2+). Withdraw flow per ADR-0014 cascades to the `ai_invocation` audit table.
6. ✅ **EVI configs are managed by us.** We mirror Hume's Config schema in our DB; on block save, we create/update the config on Hume's side via their Configs API and store the returned `config_id`. Researchers never leave MRT to author EVI configs. (Adds ~3 days to H6; locked because it keeps the researcher mental model unified — system prompt + voice + caps live in our Builder, not on platform.hume.ai.)
7. ✅ **Per-block participant audio retention.** `voice-conversation` config field `participantAudioRetention: 'never' | 'session' | 'retained'`. `'never'` = audio discarded after Hume turn-processing (default); `'session'` = retained for the study duration then auto-purged; `'retained'` = kept indefinitely (researcher acknowledges higher IRB burden — banner displayed). Same field is also added to the H3 `voice-emotion-probe` and the H3a `audio-record` emotion-option (where retention default is `'session'` because participants expect researchers to keep audio responses for analysis — different than EVI's discard-by-default ephemeral conversation).
8. ✅ **10 vetted TTS voice presets for V2.1.** Curated list owned by us; researcher-friendly names mapped internally to Hume Octave voice IDs. Full Hume catalog picker = V2.2.
9. ✅ **$50/mo default AI budget cap on new workspaces; per-workspace overridable.** Existing workspaces get no default cap (don't surprise current users). Owner can change the cap any time via Settings · Workspace → Usage → AI section.
10. ✅ **Keep both `text-emotion-probe` block and the free-text emotion option.** The dedicated block puts emotion-as-primary in the Builder/Results affordance; the option augments existing measures. Different researcher intent; different surfaces.
11. ✅ **Researcher-facing Hume branding; no participant-facing branding (unless TOS-required).** Visible in Builder Configure, AI Connections list, Results panels, Usage dashboard. Participant Take UI shows no Hume branding by default. **Pre-ship gate:** during PR H1.1, verify Hume's current TOS for participant-attribution requirements — if attribution is mandatory on participant-played generated audio, surface a small "🔊 generated by Hume" tag under TTS audio-stimulus playback (audio-stimulus only, not the other surfaces).
12. ✅ **Workspace-level cost rollup only.** Usage dashboard does not split spend by researcher; per-researcher attribution = V2.2+ if requested.

---

## What's in place today

> Corrected 2026-06-25 against the real repo — see [`code-tab-v210-hume-reconciliation.md`](code-tab-v210-hume-reconciliation.md). Several rows the original draft listed as "in place" are **not** built. They are now in *What's missing → H0*.

| Component | What's there | Where |
|---|---|---|
| ADR-0006 AI architecture (substrate **designed, not built**) | ADR-0006 commits to a **Task-based** model: typed input/output schemas, schemas-first validation, an audit log per invocation, per-tenant metering, privacy routing. **None of that substrate exists yet** — what shipped (ADR-0061) is a thin BYO-key path. | `04_architecture/adrs/0006-ai-plugin-architecture.md` (title: *Task-based AI architecture with provider adapters*) |
| `AIProviderAdapter` (minimal) | Interface is **`validateKey(apiKey)` + `chat(input)` only**. `ai` export = `anthropicAdapter`. No audit hook, no metering, no `ping`. | `05_app/server/adapters/ai.ts` + `ai.anthropic.ts` |
| `ai_provider_connection` table | Per-workspace BYO key, AES-256-GCM at rest (`api_key`), `key_hint` for the masked UI, `status`/`last_error`. Provider CHECK = `('anthropic','openai')`. | `05_app/server/db/schema.ts` (`aiProviderConnection`) |
| `ai.connections` tRPC router | `list` / `connect` / `disconnect` only — **no `test`/`ping`, no `usage`**. | `05_app/server/trpc/routers/ai.ts` |
| Workspace AI-key settings card | Paste/validate/remove an Anthropic key. **Workspace-scoped** (not account). | `components/feature/settings/ai-provider-settings.tsx` under `app/(app)/(workspace)/settings/workspace/page.tsx` |
| `ai-chat` block (ADR-0061) | Text LLM conversation; opening message / replies / time-limit + appearance (ADR-0065). The first AI feature — built on the thin path. | `server/modules/registry.ts` (`key: "ai-chat"`) + `components/feature/take/ai-chat-input.tsx` |
| Prolific Connections | PAT input; encrypted; per-workspace. Closest precedent for the Hume connect UX. | `app/(app)/(workspace)/participants/connections/page.tsx` + `server/adapters/recruitment.prolific.ts` |
| OSF Connections | PAT/OAuth connect; encrypted at rest. | `app/(app)/(personal)/settings/account/page.tsx` + study surfaces; `server/adapters/registry.osf.ts` |
| `audio-record` / `free-text` / `social-post@2.0.0` blocks | Registry entries (`source:"core"`, bare `key`, `version`), rendered via `components/feature/take/` overrides + configured in `components/feature/builder/`. **There is no `components/blocks/` dir, and no `long-text` module** (free-text has a long variant). | `server/modules/registry.ts` |
| R2 storage (ADR-0003) | `ws/` (public) + `resp/` (workspace-gated). Audio responses live in `resp/`. | `server/adapters/storage.r2.ts` (interface `storage.ts`) |
| Token encryption | AES-256-GCM keyed by `TOKEN_ENCRYPTION_KEY` (ADR-0016 §6). | `server/crypto/tokens.ts` (`encryptSecret`) |
| Inngest job substrate | Real, with several jobs to model on. The post-submit emotion job (H3a) is viable here. | `server/adapters/jobs.inngest.ts` + `server/jobs/{notification-fanout,osf-watch,registry-push,recruitment}.ts` |
| Withdraw flow | Participant/study deletion cascade lives in `server/trpc/routers/studies.ts` (+ OSF in `registry.osf.ts`/`jobs/osf-watch.ts`). **There is no `server/workers/withdraw-participant.ts`.** ADR-0014 = *Response data model + conditioning* (this is the right ADR for the cascade — but it is NOT a "PII boundary" ADR; no PII ADR exists). | `server/trpc/routers/studies.ts` |
| Adapter discipline (ADR-0007) | Real and enforced — `ai.anthropic.ts` confines the vendor SDK; `ai.hume.ts` confining `@hume/*` fits the pattern exactly. | `04_architecture/lock-in-inventory.md` |

## What's missing (the V2.1 build)

**H0 — AI substrate (must be built first; the original draft wrongly assumed this existed):**
- A **real `AIProviderAdapter` contract** that can express every AI operation as a typed, schema-validated op (chat · voice-emotion · text-emotion · TTS · streaming voice conversation), vendor confined to the adapter file.
- `ai_invocation` **audit table** (+ R2-backed `ai_invocation_payload` sidecar) — one row per AI call, any provider, any modality: workspace/study/response, provider+model, sensitivity tier, tokens-or-duration, **cost_usd**, status, timestamp.
- A **write-through metering layer** so every adapter call records an `ai_invocation` row, and a per-workspace cost rollup the cap/dashboard read from.
- **Retrofit `ai-chat` (ADR-0061) onto the new contract + audit log** so it isn't left as a thin one-off (no orphaned vendor path).

**H1–H8 (the Hume features, on top of H0):**
- Hume row on the workspace AI-keys card + `connect`/`test`/`usage` procedures (migration `0036`: extend the provider CHECK to include `hume`, add nullable `secret_key` + `webhook_signing_key`).
- `server/adapters/ai.hume.ts` (the only repo file allowed to import `@hume/*` per ADR-0007), implementing the H0 contract.
- The shared `emotionAnalysis` block-config option + the post-submit Inngest job (model on `server/jobs/registry-push.ts`).
- 4 new block kinds as **registry entries + take/results/configure components + manifest** (`voice-emotion-probe`, `text-emotion-probe`, `audio-stimulus`, `voice-conversation`).
- Biometric-consent layer above V1.5 GDPR consent; **a net-new IRB-acknowledgment table** (the mimicking-presets ack is stored in theme JSON — there is no `study_publish_acknowledgment` table to reuse).
- Emotion-vector results display + CSV/Excel export columns.
- Workspace-level Hume usage + cost meter (reads H0's metering).

---

## Section H0 — AI substrate: real adapter contract + invocation audit + metering (~1.5–2 weeks) — **BUILD FIRST**

> Added 2026-06-25. Owner chose the high-quality, substrate-first path (option **a** in the reconciliation note): build the spine ADR-0006 designed *before* layering a second vendor on top, so every future AI feature is a localized change rather than a rewrite, and cost/withdraw/audit are uniform. This was wrongly assumed "already shipped." It is the true first stream; H1 onward depend on it. (Strictly, this is V2.0-substrate work being completed; it lives here because V2.1 is the release that needs it.)

**Why this comes first (the trade-off, recorded):** the alternative — each AI feature bolting on its own vendor call, as `ai-chat` did — ships one feature faster but has no cost control, no unified audit, leaks vendor logic, and re-implements auth/metering/withdraw every time. For a second vendor handling **biometric voice data + billing + four new blocks**, that debt compounds badly. Paying the substrate cost once now buys constant flexibility (add/swap vendors + models locally), safer UX (budget caps, "withdraw deletes everything", graceful errors), and reproducible/auditable research. ~1.5–2 weeks upfront; cheaper for every AI feature after.

### H0.1 — Widen the `AIProviderAdapter` contract (~3 days)

Today: `validateKey(apiKey)` + `chat(input)` (`server/adapters/ai.ts`). Grow it into a typed, provider-agnostic op set, each op carrying an `AIInvocationContext` and validated against a declared output schema (ADR-0006 schemas-first):

```ts
// server/adapters/ai.ts (widened — exact method set finalized in the ADR)
export type AISensitivity = 'researcher_content' | 'participant_data' | 'pii';
export interface AIInvocationContext {
  workspaceId: string; studyId?: string; responseId?: string;
  blockInstanceId?: string; feature: string;       // e.g. 'ai-chat' | 'voice-emotion-probe'
  sensitivity: AISensitivity;
}
export interface AIProviderAdapter {
  validateKey(apiKey: string): Promise<boolean>;
  ping(): Promise<{ account?: string }>;            // no-cost identity check (powers connect "Test")
  chat(input: AiChatInput, ctx: AIInvocationContext): Promise<AiChatResult>;
  // Hume implements the rest (H2); other providers may no-op / throw NotSupported:
  analyzeVoice?(opts): Promise<VoiceEmotionResult>;
  analyzeText?(opts): Promise<TextEmotionResult>;
  synthesizeAudio?(opts): Promise<{ audioR2Key: string; durationMs: number; cached: boolean }>;
  startConversation?(opts): Promise<EVISession>;
}
```

The capability methods are **optional on the base interface** so a text-only provider (Anthropic) isn't forced to implement voice; the gateway throws a typed `AICapabilityUnsupported` if a feature asks a provider for an op it lacks. `ctx` threads through every call so the audit log (H0.2) is automatic, not per-feature boilerplate.

### H0.2 — `ai_invocation` audit table + write-through gateway (~3 days)

A thin gateway wraps the adapter so **every** AI call writes one audit row — no feature can call a provider without being logged. Migration (part of `0036`):

```sql
CREATE TABLE ai_invocation (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  study_id UUID REFERENCES experiment(id) ON DELETE SET NULL,
  response_id UUID REFERENCES response(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,                     -- 'ai-chat' | 'voice-emotion-probe' | ...
  provider TEXT NOT NULL,                    -- 'anthropic' | 'hume' | ...
  model TEXT,
  modality TEXT NOT NULL CHECK (modality IN ('text','voice','tts','conversation')),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('researcher_content','participant_data','pii')),
  input_tokens INTEGER, output_tokens INTEGER, duration_ms INTEGER,
  cost_usd NUMERIC(10,5) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok','error')),
  error_code TEXT,
  result_summary JSONB,                      -- small: top-3 emotions + valence/arousal; full vector → sidecar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- R2-backed sidecar for large payloads (full emotion vectors, transcripts):
CREATE TABLE ai_invocation_payload (
  invocation_id TEXT PRIMARY KEY REFERENCES ai_invocation(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL
);
```

The gateway also enforces the per-workspace `allow_pii_to_external_ai` flag (default false) — a `sensitivity: 'pii'` call against a workspace that hasn't opted in throws before any vendor call.

### H0.3 — Per-workspace cost metering + cap primitive (~2 days)

`ai.usage({ range })` rolls up `sum(ai_invocation.cost_usd)` per workspace per modality/provider. A `workspace_settings.monthly_ai_budget_usd_cap` column (additive, nullable) + a gateway check that throws `WorkspaceAICapExceeded` at 100% and emits an 80% warning event. This is the substrate H8c's dashboard and the owner-locked $50 cap read from — built once here, consumed everywhere.

### H0.4 — Retrofit `ai-chat` (ADR-0061) onto the substrate (~2 days)

Route the existing `ai-chat` turn engine through the new gateway so it writes `ai_invocation` rows and respects the cap. No orphaned thin path; the advisory cost estimate in Configure can later read real per-study spend. This is the proof the substrate works end-to-end before any Hume code lands.

### ADR + tests

- ADR (next number — see ADRs section) locks: the widened contract; the `ai_invocation` + sidecar tables; the write-through gateway; `allow_pii_to_external_ai`; the cap primitive; the ai-chat retrofit.
- Unit: gateway writes exactly one `ai_invocation` row per call (ok + error paths); pii-blocked path throws pre-vendor; cap math (throws >cap, not at cap, warns at 80%).
- Integration: ai-chat turn produces an `ai_invocation` row with correct cost.

---

## Section H1 — Hume row on the AI-keys card + connect/test (~3 days)

**Surface:** extend the existing **workspace** AI-keys card (`components/feature/settings/ai-provider-settings.tsx`, under Settings · Workspace), not a new "Settings · Account" page. It currently lists Anthropic; add a Hume row beside it.

| Provider | Status | Actions |
|---|---|---|
| Anthropic (Claude) | Connected • •••• 1a2b | Disconnect / Test |
| **Hume (emotion + voice)** | **Not connected** | **Connect** |

### Connect-Hume flow

Clicking **Connect** opens a modal. Hume issues **three keys** (https://platform.hume.ai/settings/keys):

- **Hume API key** — Expression Measurement + Octave TTS + EVI Configs API
- **Hume Secret key** — paired with the API key for EVI WebSocket auth
- **Hume Webhook signing key** — validates incoming EVI webhook events (H6)
- Info box: "Keys are encrypted at rest (`TOKEN_ENCRYPTION_KEY` via `server/crypto/tokens.ts`). We never log raw keys. Disconnecting deletes them here but does not revoke them on Hume."
- **Test connection** → `ai.connections.test({ provider:'hume' })` → adapter `ping()` → "Connected as: {account}".
- Submit → encrypts the three keys, upserts the `ai_provider_connection` row.

### Data shape — extend the real table (migration `0036`)

The table is **`ai_provider_connection`** (already exists). Do **not** create `ai_connection`. Migration `0036`:

```sql
-- extend the provider CHECK to include hume
ALTER TABLE ai_provider_connection DROP CONSTRAINT ai_provider_connection_provider;
ALTER TABLE ai_provider_connection ADD CONSTRAINT ai_provider_connection_provider
  CHECK (provider IN ('anthropic','openai','hume'));
-- Hume needs two extra encrypted keys (additive, nullable; existing rows unaffected)
ALTER TABLE ai_provider_connection ADD COLUMN secret_key TEXT;           -- encrypted
ALTER TABLE ai_provider_connection ADD COLUMN webhook_signing_key TEXT;  -- encrypted
```

Existing columns reused as-is: `api_key` (encrypted), `key_hint`, `status`, `last_error`, `user_id`, `created_at`/`updated_at`. (No `last_used_at`; `last_used_at`-style "last used" can come from `ai_invocation` instead.)

### tRPC procedures (extend `server/trpc/routers/ai.ts`)

- `ai.connections.list` — exists (add Hume to the returned shape).
- `ai.connections.connect({ provider:'hume', apiKey, secretKey, webhookSigningKey })` — extend; workspace-admin only.
- `ai.connections.disconnect({ provider })` — exists.
- **`ai.connections.test({ provider })` — NEW** (no `test`/`ping` today) → adapter `ping()`.
- **`ai.connections.usage({ range })` — NEW** (provided by H0.3).

### Wireframe gate

`03_design/wireframes/settings-ai-connections.md` (the AI-keys card is workspace-scoped; show the Hume row + connect modal).

### Tests

- Unit: encrypt → decrypt round-trips for all three Hume keys.
- Unit: `disconnect` deletes the row, leaves upstream Hume keys.
- Unit: migration `0036` — provider CHECK accepts `hume`, rejects garbage; new columns nullable.
- e2e: connect → test → "Connected as: …" → disconnect → row gone.

---

## Section H2 — Hume adapter implementing the H0 contract (~4-5 days)

> **Status (2026-06-25): TTS shipped; emotion deferred to H3a.** `synthesizeAudio` is implemented in `ai.hume.ts` against the verified synchronous `POST /v0/tts` (base64 audio), with a gateway `runTts()` wrapper (audit + budget; advisory `ttsCostUsdFromChars`). It returns the audio **bytes** — R2 persistence + caching + the voice-preset catalog are H5. The **emotion** methods (`analyzeText`/`analyzeVoice`) are NOT here: Expression Measurement is batch/async (see the H4a correction), so they land **with the `hume.analyze` Inngest job in H3a**, internally submitting+polling the batch API. `startConversation` (EVI) is H6.

Builds on **H0** (the contract + audit gateway already exist). V2.1 adds:

- One adapter file: `05_app/server/adapters/ai.hume.ts` (the only file allowed to import `@hume/*`), implementing the optional capability methods (`analyzeVoice` / `analyzeText` / `synthesizeAudio` / `startConversation`) of the H0 `AIProviderAdapter` contract.
- **No new audit table** — `ai_invocation` is H0's; Hume calls flow through the same write-through gateway, so cost/audit/withdraw are automatic. (The original draft's "additive columns on the V2.0 `ai_invocation` table" was wrong — there was no table; H0 builds it.)
- A `humeAdapter` factory taking decrypted `{ apiKey, secretKey, webhookSigningKey }`.

### Interface (new — V2.1-specific subset of `AIProviderAdapter`)

```ts
// server/adapters/ai.hume.ts
import type { AIProviderAdapter, AIInvocationContext } from './ai.types';

export interface HumeAdapter extends AIProviderAdapter {
  // — Expression Measurement API —
  analyzeVoice(opts: {
    ctx: AIInvocationContext;            // workspaceId, studyId, responseId, sensitivity: 'pii'
    audioR2Key: string;                  // resp/<ws>/<study>/<resp>/<block>.webm
  }): Promise<VoiceEmotionResult>;

  analyzeText(opts: {
    ctx: AIInvocationContext;            // sensitivity: 'participant_data'
    text: string;
    language?: string;                   // default: 'en'
  }): Promise<TextEmotionResult>;

  // — Octave TTS —
  synthesizeAudio(opts: {
    ctx: AIInvocationContext;            // sensitivity: 'researcher_content' — no participant PII
    script: string;
    voicePresetId: string;               // 'narrator-neutral' | 'narrator-warm' | 'narrator-urgent' | ...
    emotionalDimensions?: { valence?: number; arousal?: number; intensity?: number };
  }): Promise<{ audioR2Key: string; durationMs: number; cached: boolean }>;

  // — Empathic Voice Interface (EVI) —
  startConversation(opts: {
    ctx: AIInvocationContext;            // sensitivity: 'pii'
    configId: string;                    // Hume EVI config (system prompt + voice + tools)
    onTurn: (turn: EVITurn) => void;     // called per-turn; turn includes role, transcript, emotionVector, audioChunk
    onClose: (reason: string) => void;
  }): Promise<EVISession>;
}

export interface VoiceEmotionResult {
  invocationId: string;                  // ai_invocation.id
  durationMs: number;
  emotions: Record<string, number>;       // { 'joy': 0.42, 'sadness': 0.08, ... }
  valence: number;                       // -1..1
  arousal: number;                       // 0..1
  transcript?: string;                   // if Hume returns one
  costUsd: number;
}

export interface TextEmotionResult {
  invocationId: string;
  emotions: Record<string, number>;
  valence: number;
  arousal: number;
  costUsd: number;
}

export interface EVITurn {
  turnId: string;
  role: 'user' | 'assistant';
  transcript: string;
  emotions: Record<string, number>;
  audioR2Key?: string;                   // assistant audio cached for replay
  startedAt: Date;
  durationMs: number;
}

export interface EVISession {
  sessionId: string;
  ws: WebSocket;                          // exposed for the orchestration layer; raw use forbidden outside adapter
  sendUserAudio(chunk: ArrayBuffer): void;
  close(): Promise<void>;
}
```

### `ai_invocation` — already built in H0

The `ai_invocation` table + its R2-backed `ai_invocation_payload` sidecar are **built in H0.2**, not here, and they already carry `modality`, `duration_ms`, `cost_usd`, `result_summary`, and `sensitivity`. Hume's adapter methods just flow through the H0 gateway, so each Hume call writes its audit row automatically. (The original draft's "additive columns on the V2.0 table" assumed a table that didn't exist — see the reconciliation note.)

### Cost metering — reads H0.3

Each Hume invocation writes `cost_usd` (from Hume's response headers, or for TTS from script length) via the H0 gateway. Workspace usage rolls up via `ai.usage({ range })` (H0.3) → Settings · Workspace → Usage → AI section.

### Sensitivity routing (per ADR-0006 + the H0 gateway)

`AIInvocationContext.sensitivity` ∈ `researcher_content | participant_data | pii`. The **H0 gateway** (not the Hume adapter itself) refuses a `pii` call when the per-workspace `allow_pii_to_external_ai` flag is false (default false) — enforced once, for every provider.

### Wireframe gate

`03_design/wireframes/settings-workspace-usage-ai.md` (cost meter + per-modality breakdown).

### Tests

- Unit: each adapter method mocks the Hume HTTP/WebSocket and returns the typed shape.
- Unit: a call with `sensitivity: 'pii'` against a workspace with `allow_pii_to_external_ai: false` throws `HumePIIBlockedError`.
- Integration: a single end-to-end `analyzeText` call against the real Hume API (gated env var `RUN_HUME_E2E=1`).

---

## Section H3 — Voice emotion analysis: option on existing blocks + dedicated probe block (~2 weeks)

> ⏸️ **Blocked-on-verification (2026-06-25):** the emotion adapter methods (`analyzeText`/`analyzeVoice`) need the **exact predictions JSON nesting** of Hume's Expression Measurement batch results (the path down to each `{name, score}` emotion). The submit/poll flow + request body are verified (`POST /v0/batch/jobs` `{ models: { language|prosody: {} }, text|urls: [...] }` → `job_id`; `GET /v0/batch/jobs/:id` status; `GET /v0/batch/jobs/:id/predictions`), but the predictions structure couldn't be fetched (Hume's reference is a client-rendered SPA that 404s to server fetch). Per the no-invent rule, the parser was NOT written from memory. **To unblock:** paste a sample language-model predictions payload from the rendered Hume reference, OR confirm the parser against a live job with a real key. Until then, **H5 (TTS, fully verified) was built first.** When unblocked, also resolve: Hume returns emotion scores (48–53 dims), NOT valence/arousal — derive those in the results layer or drop them (the H0 `AiEmotionResult` valence/arousal are optional).

### H3a — Option on existing audio blocks (~3 days)

Every existing audio-capturing block gets an optional **Emotion analysis** toggle in its Configure panel:

- `core/audio-record@1.0.0`
- Any V1.12 voice-response block introduced in functional polish
- The participant-comment field on `core/social-post@2.0.0` (when voice variant is enabled — currently text-only, but the schema is flexible)

**Block Configure UI addition (one shared section):**

```
☐ Analyze emotion (Hume)
   When enabled: after each participant submits this block, their audio is
   sent to Hume for emotion analysis. Scores appear in Results alongside
   the raw audio.

   Sensitivity: PII (biometric voice analysis)
   This requires participant biometric consent (see Settings · Privacy).
   Approx. cost: ~$0.005 per 30-second response.

   [Connected as: lab@university.edu via Hume]   [Manage connection →]
```

**Block-config schema addition (shared across applicable blocks):**

```ts
// added to the union shape of every emotion-eligible block's `config`
emotionAnalysis?: {
  enabled: boolean;
  provider: 'hume';                  // future: room for 'azure-emotion' / 'aws-comprehend' etc.
  modality: 'voice' | 'text';        // derived from block kind but stored for clarity
  // owner-locked answer #2 — per-block participant audio retention (voice modality only)
  participantAudioRetention?: 'never' | 'session' | 'retained';
  // default 'session' for audio-record + voice-emotion-probe blocks
  // (researchers expect to keep response audio for review);
  // 'never' for EVI conversation per H6;
  // 'retained' requires escalated IRB acknowledgment at publish time
};
```

**Retention semantics:**

- `'never'` — audio is uploaded to R2, processed by Hume, then deleted from R2 + the `resp/` key cleared from `response_item.audio_r2_key`. Only the emotion vector + transcript (if Hume returned one) persists.
- `'session'` — audio stays in R2 for the duration of the study (until study close OR explicit researcher purge); auto-purged on study close.
- `'retained'` — audio kept indefinitely in R2. Researcher's IRB-acknowledgment escalates at publish time.

Withdraw flow (per ADR-0014) deletes audio in all three cases regardless of retention setting.

**Submit-time flow:**

1. Participant submits the block → `recordAnswer` writes the `response_item` row as today.
2. If `config.emotionAnalysis?.enabled === true`, `recordAnswer` enqueues an Inngest job `hume.analyze-voice` with `{ responseId, blockInstanceId, audioR2Key }`.
3. The job calls `humeAdapter.analyzeVoice(...)`; writes the `ai_invocation` row; writes the `result_summary` JSONB onto `response_item.emotion_analysis`.
4. Failures retry 3× with exponential backoff; permanent failure flags the response_item with `emotion_analysis_status: 'failed'` + a friendly error code (researcher sees "Hume couldn't analyze 2 of 47 audio responses" in Results).

**Results display:**

- For each emotion-analyzed block, the Results page shows an **Emotion** panel under the standard summary:
  - Top-N emotion bars (joy / sadness / anger / surprise / fear / contempt / disgust — 7 default, configurable)
  - Per-condition mean valence + arousal scatter plot
  - "Listen + see scoring" — clicking a response row plays the audio with an overlaid emotion timeline
- CSV/Excel export adds columns: `<block>_emotion_joy`, `<block>_emotion_sadness`, ..., `<block>_valence`, `<block>_arousal`.

### H3b — `core/voice-emotion-probe@1.0.0` (new dedicated block) (~1 week)

A block kind where **emotion is the response**, not a side-channel measure.

**Researcher Builder config:**

- **Prompt** (rich-text; what the participant reads/sees before recording)
- **Recording duration** (5-120 seconds; default 30s)
- **Max attempts** (1-3; default 1)
- **Show scoring to participant?** (default: no — researcher-only; if yes, participant sees their valence/arousal at end with optional "rerecord" affordance — this is a research-affordance, not a participant-feedback feature)
- **Required emotion dimensions** (which scores to compute — default: all 7 standard + valence + arousal)
- **Emotion-analysis toggle is always on** (this is the whole point of the block); no opt-out.

**Participant Take UI:**

- Reads prompt; sees a single big "Record" button.
- 3-2-1 countdown → record indicator + waveform.
- Auto-stop at duration limit (or manual stop button).
- "Submit" → upload to R2 → enqueue Hume → next block.

**Results display:**

- Identical to H3a but primary surface (not a side panel) — emotion-vector chart is the main view; raw audio is the secondary affordance.

**Use cases:**

- Affect recall: "Tell us about a time you felt frustrated with a product."
- Stimulus reaction: "React out loud to the article you just read."
- Spontaneous-speech probe before/after manipulation.

### Wireframe gates

- `03_design/wireframes/block-audio-record-configure.md` (extend with the Emotion analysis toggle section)
- `03_design/wireframes/block-voice-emotion-probe-configure.md`
- `03_design/wireframes/block-voice-emotion-probe-take.md`
- `03_design/wireframes/results-emotion-panel.md`

### Tests

- Unit: `recordAnswer` enqueues Hume job when toggle on; doesn't enqueue when off.
- Unit: job calls adapter and writes result_summary; failure path flags response_item.
- e2e: researcher creates an audio-record block + toggles emotion on → participant records → Results shows emotion bars (uses fixture Hume response from `e2e/fixtures/hume-voice-fixture.json`).
- e2e: researcher creates `voice-emotion-probe` block → participant takes → Results renders.

---

## Section H4 — Text emotion analysis: option on existing blocks + dedicated probe block (~1 week)

### H4a — Option on existing text blocks (~3 days)

> ⚠️ **Correction (2026-06-25, verified against Hume docs):** Hume Expression Measurement has **no synchronous REST** path — it's **batch (POST /v0/batch/jobs, async + poll)** or **WebSocket (streaming)**. So the "Synchronous Hume call on submit" below is **not achievable**; text emotion must run as an **async Inngest job** exactly like H3a (voice). Treat H4a as "same as H3a but text input," sharing one `hume.analyze` job that submits a batch job, polls, and writes the result. The `analyzeText`/`analyzeVoice` adapter methods (which internally submit+poll the batch API) land **with that job in H3a**, not in H2. (H2 shipped the verified, synchronous **TTS** method instead.)

Mirror of H3a but for text. The toggle appears on:

- `core/free-text@1.0.0` (short + long variants)
- `core/long-text` (V1.12)
- Any free-text comment field on composite blocks (social-post comment, debrief text, open-ended manipulation check)

**Differences from H3a:**

- Sensitivity tag is `participant_data`, not `pii` — no biometric consent layer required (V1.5 GDPR consent covers it). Still subject to the workspace-level "Allow external AI on participant data" toggle.
- **Synchronous** Hume call on submit (text analysis is sub-second; no Inngest job needed). Failures fall back to "we'll retry on the Results page"; researcher can manually trigger retry.
- Cost is ~$0.001 per response — order of magnitude cheaper than voice.

**Block-config schema:** same shared addition as H3a (`emotionAnalysis: { enabled, provider, modality: 'text' }`).

### H4b — `core/text-emotion-probe@1.0.0` (new dedicated block) (~3 days)

A block where **the text is incidental and the emotion is the measure**.

**Researcher Builder config:**

- Prompt (rich-text)
- Min/max length (chars)
- **Show emotion scores to participant?** (default: no)
- Required emotion dimensions

**Participant Take UI:**

- Identical to free-text but: on submit, sync call to Hume → emotion bars rendered (if researcher enabled "show scores"), then next block.

**Use cases:**

- Reaction to stimulus in text form (when audio is impractical — desktop participant, noisy environment)
- Open-ended manipulation check where emotion-of-the-answer matters more than content
- Sentiment-tagged debrief

### Wireframe gates

- `03_design/wireframes/block-free-text-configure.md` (extend)
- `03_design/wireframes/block-text-emotion-probe-configure.md`
- `03_design/wireframes/block-text-emotion-probe-take.md`

### Tests

- Same shape as H3a/H3b but text-specific.

---

## Section H5 — `core/audio-stimulus@1.0.0` (Octave TTS, new dedicated block) (~1.5 weeks)

A stimulus delivery block where the researcher writes a script + picks an emotional delivery, and Hume Octave generates the audio at study-publish time.

### Researcher Builder config

- **Script** (plain text or SSML-light; max ~500 chars per stimulus)
- **Voice preset** — owner-locked answer #3 = exactly **10 vetted presets in V2.1** (V2.2 = full Hume catalog picker). The V2.1 preset list (researcher-friendly names mapped to Hume Octave voice IDs internally):
  1. `narrator-neutral` — flat newsreader baseline
  2. `narrator-warm` — friendly storyteller
  3. `narrator-urgent` — breaking-news anxiety
  4. `narrator-anxious` — uneasy, hedging
  5. `peer-casual` — same-age peer, conversational
  6. `peer-skeptical` — disbelieving peer
  7. `authority-formal` — expert/clinician
  8. `authority-warm` — pediatrician / counselor
  9. `voice-young-energetic` — younger demographic
  10. `voice-mature-calm` — older demographic, measured

  Map maintained in `server/adapters/ai.hume.ts` as a constant; full Hume voice catalog inside the adapter but not exposed in Builder.
- **Emotional dimensions** (sliders, optional — `valence: -1..1`, `arousal: 0..1`, `intensity: 0..1`)
- **Per-condition variants?** (toggle — if on, the Configure panel shows one variant per condition; researcher writes the same script with a different voice/emotion per condition. Default: same audio across all conditions.)
- **Playback controls** (`play once` / `play N times` / `forced-listen` — borrows pattern from V1.12 video-stimulus block)
- **Generate audio** button: kicks off `humeAdapter.synthesizeAudio` for each (script, voice, emotion) tuple; generated audio cached in R2 under `ws/<workspace>/audio-stimulus/<block_instance>/<variant_hash>.mp3`. Cache key is a hash of (script, voicePresetId, emotionalDimensions) — re-generating with identical inputs is a cache hit with no cost.

**Generation status:**

- Inline status: "Generating 3 variants… (2 of 3 done)"
- Failed generation: per-variant retry; persistent failure logs the error + lets researcher edit and retry.

### Participant Take UI

- Renders a play button + duration indicator + (optional) waveform.
- If `play once`: button greys out after first play.
- If `play N times`: counter "Plays remaining: 2 of 3".
- If `forced-listen`: Continue button disabled until audio completes.
- Per-condition variant selected automatically based on participant's assigned condition.

### Results display

Audio stimulus blocks don't have responses (they're delivery), but the Results page shows:

- Which variant played for which participant (already in `response.conditionId`)
- Per-variant listen-through rate (% of participants who finished it)
- Audio waveform visualization (optional)

### Use cases (locking the value prop)

- Misinformation research: same headline read in trustworthy vs sketchy voice
- Persuasion: emotional manipulation in same script across conditions
- Health messaging: anxiety-inducing vs calm delivery of identical health advice
- Voice-condition × text-content factorial designs

### Cost model

- Generation: ~$0.05 per ~30-second clip (per-character pricing; verify in adapter implementation)
- Generation is per-publish, not per-participant — a study with 5 audio-stimulus blocks × 3 conditions = 15 generations regardless of participant count. Cheap.
- Caching: identical input = no regeneration. Critical for iterative researcher workflows.

### Wireframe gates

- `03_design/wireframes/block-audio-stimulus-configure.md`
- `03_design/wireframes/block-audio-stimulus-take.md`
- `03_design/wireframes/block-audio-stimulus-results.md`

### Tests

- Unit: cache key correctly hashes (script + voice + emotion); identical input returns cached audioR2Key.
- Unit: per-condition variants generate correctly; participant assigned to condition X plays variant X.
- e2e: researcher writes script → generates 3 variants → participant in condition 1 plays variant 1 → Results shows which variant played.

---

## Section H6 — `core/voice-conversation@1.0.0` (EVI conversational interface, new dedicated block) (~3 weeks)

The most ambitious block in V2.1. Participant has a real-time voice conversation with a Hume EVI-powered AI agent; researcher gets full transcript + per-turn emotion vectors for both sides.

### Researcher Builder config

- **System prompt** (multi-line; defines the agent's personality, topic, goal, constraints)
- **Voice** (Hume voice preset — same 10-preset picker as H5)
- **Duration cap** (1-15 minutes; default 5; hard stop)
- **Turn cap** (5-50 turns; default 20)
- **Agent's starting line** (optional — what the agent says first; default: agent waits for participant)
- **Allowed topics / forbidden topics** (free-text lists; surfaced to the agent as additional system-prompt constraints)
- **Tools the agent can use** (V2.1: none; V2.2+: could pass back to study state — e.g., agent can "mark participant as eligible for follow-up question X")
- **Participant-visible transcript?** (default: yes; shows the chat-style history during the call)
- **Allow participant to end early?** (default: yes; button "End conversation")
- **Participant audio retention** (default `'never'` — audio discarded after Hume turn-processing; transcripts + emotion vectors kept regardless). Options: `'never'` / `'session'` (purged at study close) / `'retained'` (indefinite; banner explains higher IRB burden + auto-requires the stricter publish acknowledgment). Per owner-locked answer #2, this is per-block — different EVI blocks in the same study can have different retention if the researcher needs it.
- **IRB acknowledgment gate**: checkbox "I have IRB approval or equivalent for AI-mediated participant interaction" — required before researcher can publish a study using this block (mirrors V1.12 mimicking-presets pattern). When `participantAudioRetention === 'retained'`, the checkbox copy escalates: "I have IRB approval for AI-mediated voice interaction AND for indefinite retention of participant biometric audio data."

### Hume Config management (we own this; owner-locked answer #1)

On block save (the `studies.setBlocks` mutation), if the block kind is `core/voice-conversation@1.0.0`:

1. Read the block's `config` (system prompt, voice, caps, etc.)
2. Compute a config fingerprint (hash of the relevant fields)
3. Look up `hume_evi_config` table for an existing row matching `(workspace_id, fingerprint)` — if found, reuse the `hume_config_id`
4. Otherwise, call `humeAdapter.createOrUpdateEVIConfig(...)` — which POSTs to Hume's Configs API, gets back a `config_id`, and writes a `hume_evi_config` row tying our local fingerprint to Hume's config ID
5. Store `hume_config_id` in the block's persisted config (so the runtime knows which Hume config to start a session against)

**Why managed by us:**

- Researchers don't leave MRT to author conversation behavior
- Config changes flow through our Builder (and through study versioning per ADR-0012 — preregistered configs are frozen)
- Withdraw / workspace-delete cascades to Hume (we DELETE configs on Hume's side when a study is hard-deleted; pre-existing AI-conversation responses are unaffected — the config ID lives on in `ai_conversation.hume_config_id` history)

**Schema:**

```sql
CREATE TABLE hume_evi_config (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,                 -- hash of (system_prompt, voice_id, caps, ...)
  hume_config_id TEXT NOT NULL,              -- Hume's returned config ID
  hume_config_version INTEGER,               -- Hume's version counter
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (workspace_id, fingerprint)
);
```

**Adapter additions:**

```ts
// in ai.hume.ts (V2.1 additions)
createOrUpdateEVIConfig(opts: {
  ctx: AIInvocationContext;
  systemPrompt: string;
  voicePresetId: string;
  durationCapSeconds: number;
  turnCap: number;
  // ... etc
}): Promise<{ humeConfigId: string; humeConfigVersion: number }>;

deleteEVIConfig(opts: { ctx: AIInvocationContext; humeConfigId: string }): Promise<void>;
```

### Participant Take UI

- Pre-call screen: "You're about to have a voice conversation with an AI agent named {agent_name}. The conversation will be recorded and analyzed. You can stop at any time. Click below when ready."
- Big "Start conversation" button.
- Active call: live waveform of participant audio + agent audio; chat-style transcript scrolling below (if researcher enabled it); timer countdown.
- Mic-permission check before start; graceful fallback if denied.
- "End conversation" button always visible.

### Architecture — real-time transport

Hume EVI uses a **WebSocket** (`wss://api.hume.ai/v0/evi/chat` or current endpoint — verify in adapter implementation). This is the only WebSocket dependency in MRT — handle carefully.

**Server-side orchestration:**

- Participant browser opens a WebSocket to **our** server (Next.js Route Handler with `runtime: 'edge'` or a tRPC-Subscription endpoint — pick during implementation; the edge runtime gives lower latency).
- Our server opens a WebSocket to Hume using the workspace's encrypted Hume keys (decrypted in-memory per session; never sent to browser).
- We proxy:
  - Participant mic → our WS → Hume WS
  - Hume agent audio → our WS → participant browser
- Per-turn events from Hume (transcript + emotion vector) are written to `ai_conversation_turn` table in real time.
- At session end (or hard cap), we write a single `ai_conversation` row summarizing the session.

**Why proxy instead of direct browser → Hume?**

- Browser never sees the Hume API key (single biggest reason)
- Per-turn data lands in our DB synchronously (no client-side reconciliation)
- We can enforce duration/turn caps + early-end on the server
- Cost metering is authoritative (we count what we proxy)

### Data shape

```sql
CREATE TABLE ai_conversation (
  id TEXT PRIMARY KEY,
  response_id UUID NOT NULL REFERENCES response(id) ON DELETE CASCADE,
  block_instance_id TEXT NOT NULL,
  hume_session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT CHECK (ended_reason IN ('duration_cap', 'turn_cap', 'participant_ended', 'error')),
  total_turns INTEGER,
  cost_usd NUMERIC(8, 4)
);

CREATE TABLE ai_conversation_turn (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  transcript TEXT NOT NULL,
  emotions JSONB NOT NULL,             -- { 'joy': 0.41, 'sadness': 0.05, ... }
  valence NUMERIC(4, 3),
  arousal NUMERIC(4, 3),
  audio_r2_key TEXT,                   -- assistant audio cached for replay; participant audio NOT cached (PII minimization unless researcher opts in)
  started_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  UNIQUE (conversation_id, turn_index)
);
```

### Results display

- Per-response detail view: full transcript with role labels + per-turn emotion bars + per-turn audio replay (assistant only by default; participant audio opt-in)
- Aggregate: per-condition emotion trajectory chart (X = turn index, Y = valence; one line per condition averaged across participants)
- Per-condition transcript samples (random N samples per condition for qualitative review)
- CSV export: one row per turn (response_id, turn_index, role, transcript, emotions_json, valence, arousal, duration_ms)

### IRB gate enforcement

When publishing a study containing an `voice-conversation` block:

- Publish-time check: "This study uses AI-mediated voice conversation. Confirm you have IRB approval or equivalent for this interaction." Researcher confirms by checking the box; publish-action records the acknowledgment in a **new `study_publish_acknowledgment` table** (this does NOT exist yet — the V1.12 mimicking-presets ack is stored in theme JSON as `mimicAcknowledged`, not a table; building this table is V2.1 scope, see H7c).
- Per-participant disclosure (auto-rendered above the pre-call screen): "This study includes a conversation with an AI agent. By participating, you acknowledge that this interaction is with software, not a human. Your voice will be analyzed for emotional content. You can stop the conversation at any time."

### Use cases

- "AI therapist" research: participant talks to an empathetic AI; researcher studies trust/disclosure
- AI ethics: how do participants respond to AI displaying empathy vs neutral affect?
- Persuasion: virtual canvasser scenarios
- Health interventions: AI-delivered motivational interviewing
- Job-interview anxiety: practice with an AI interviewer

### Wireframe gates

- `03_design/wireframes/block-ai-conversation-configure.md`
- `03_design/wireframes/block-ai-conversation-take-precall.md`
- `03_design/wireframes/block-ai-conversation-take-active.md`
- `03_design/wireframes/block-ai-conversation-results-detail.md`
- `03_design/wireframes/block-ai-conversation-results-aggregate.md`
- `03_design/wireframes/study-publish-irb-ai-acknowledgment.md` (amendment to the V1.12 mimicking-presets pattern)

### Tests

- Unit: WebSocket-proxy correctly bridges participant ↔ Hume; closes cleanly on cap reached / participant-ended / error.
- Unit: `ai_conversation_turn` rows written per Hume turn event; emotions JSONB shape validated.
- Unit: IRB gate blocks publish when checkbox unchecked.
- Integration: fixture-Hume EVI replay (recorded session played back through a stub WebSocket); verify turn rows + summary row match the fixture.
- e2e: gated `RUN_HUME_E2E=1` — researcher publishes a 2-turn study → e2e harness opens a participant browser, takes the call (via Playwright + Web Audio stub), Results shows transcript.

---

## Section H7 — Biometric consent surface + IRB gates (~1 week)

V1.5 shipped a generic GDPR consent screen at the start of every study. V2.1 adds two layers:

### H7a — Study-level biometric consent banner (when study contains any voice-analyzing block)

A second screen between the V1.5 GDPR consent and the first block:

> **This study analyzes the emotional content of your voice.**
>
> When you record audio responses in this study, the recordings will be sent to a third-party service (Hume AI) to compute emotion scores. The recordings and emotion scores are stored by the researcher who created this study.
>
> You can withdraw at any time; withdrawal deletes your recordings and emotion scores.
>
> [I consent and want to continue] [I don't consent — exit]

### H7b — Per-block emotion-analysis disclosure (light)

When emotion analysis is enabled on an existing block (H3a/H4a), a small line of disclosure copy appears above the block content during the take:

> *This question's response will be analyzed for emotional content.*

(Less heavy-handed than a full screen; pattern matches existing block-level disclosures like "This question is timed.")

### H7c — Researcher IRB-acknowledgment gates

Three publish-time gates:

1. **Any emotion-analysis block in the study:** "I have appropriate IRB approval (or equivalent) to collect biometric voice data and/or text emotion data from participants. [confirmed]"
2. **Any `voice-conversation` block:** the stronger gate (per H6) about AI-mediated interaction.
3. **Any `audio-stimulus` block with emotional dimensions outside the neutral baseline:** "I have IRB approval to deliver emotionally-charged audio stimuli to participants. [confirmed]" (mirrors V1.12 mimicking-presets exactly)

All three gates write to the **new `study_publish_acknowledgment` table** (net-new in V2.1 — there is no such table today; the V1.12 mimicking ack lives in theme JSON). Each ack is timestamped + linked to the publishing user + survives study forking (forked studies require fresh acknowledgment by the new owner).

### Withdraw flow extension (ADR-0014 amendment)

When a participant withdraws:

- `response_item.audio_r2_key` → R2 delete
- `response_item.emotion_analysis` → cleared
- `ai_invocation` rows where `response_id = $1` → deleted
- `ai_conversation` + `ai_conversation_turn` → deleted (cascades via `ON DELETE CASCADE`)
- `ai_invocation_payload` R2 sidecar → deleted

Existing withdraw worker (`server/workers/withdraw-participant.ts`) extended with these steps.

### Wireframe gates

- `03_design/wireframes/take-flow-biometric-consent.md`
- `03_design/wireframes/take-flow-block-emotion-disclosure.md`
- `03_design/wireframes/study-publish-irb-emotion-acknowledgment.md`

### Tests

- e2e: study with emotion blocks → participant sees consent screen → declines → exits cleanly with no data written.
- e2e: study with emotion blocks → participant consents → completes → withdraws → all emotion data deleted (verified by query).
- Unit: publish blocks without all required IRB acknowledgments throw `MissingAcknowledgmentError` with friendly message naming each missing gate.

---

## Section H8 — Results, exports, and workspace usage dashboard (~1 week)

### H8a — Emotion-vector results panel (~3 days)

Reusable React island (`<EmotionResultsPanel responseItemId={...} />`) rendered:

- Inside each emotion-analyzed block's Results section (H3a/H4a)
- As the primary view for dedicated emotion blocks (H3b/H4b)
- As the per-turn detail view for ai-conversation blocks (H6)

**Visual elements:**

- Top-7 emotion bars (configurable in block config — default: joy, sadness, anger, surprise, fear, contempt, disgust)
- Valence + arousal scatter plot (per response, colored by condition)
- Per-condition mean + SD overlay
- "Compare conditions" toggle: switches to per-condition mean trajectory or bar comparison
- Methodological note tooltip (always visible, on hover): *"Hume emotion scores are exploratory measures. Validate with self-report measures where the construct matters."*

### H8b — Export columns (~1 day)

CSV/Excel export builder (the V1.12 Export builder) gets a new section:

- Emotion-analyzed blocks expose per-emotion-dimension columns (`<block_slug>_emotion_<dimension>`) plus `<block_slug>_valence` + `<block_slug>_arousal`
- ai-conversation blocks export one row per turn (separate "Conversation turns" sheet in Excel; second CSV file `<study>_conversation_turns.csv` in zip export)

### H8c — Workspace usage dashboard (~3 days)

`Settings · Workspace → Usage → AI` (new sub-tab):

- This-month spend by provider (Hume / Anthropic / OpenAI / etc.)
- Per-provider per-modality breakdown for Hume (voice / text / TTS / conversation)
- Top-spending studies (linked)
- Per-month historical chart
- **Owner-locked answer #7: workspace-level cost rollup only.** No per-researcher attribution column. (Owner can request per-researcher attribution as V2.2+ work if they later want to see which team member is most expensive.)
- Budget cap: **owner-locked answer #4** — workspace-owner-configurable monthly cap. **New workspaces auto-seed with a $50/mo default cap** (additive migration sets `workspace_settings.monthly_ai_budget_usd_cap = 50` for rows created on or after the V2.1 release date); **existing workspaces get NULL** (no surprise enforcement on incumbent users — they explicitly enable a cap). When crossed, the next AI invocation throws `WorkspaceAICapExceeded` with a friendly message; researcher sees a notice + can raise the cap (workspace-admin only) or wait until next month. Warning surfaces at 80% via in-app notification.

### Wireframe gates

- `03_design/wireframes/results-emotion-panel.md`
- `03_design/wireframes/export-builder-emotion-columns.md`
- `03_design/wireframes/settings-workspace-usage-ai.md`

### Tests

- Unit: emotion panel renders correctly given fixture data; cross-condition comparison view computes means correctly.
- Unit: export builder includes emotion columns when toggled; conversation-turns sheet correctly nested per response.
- Unit: workspace cap enforcement throws when sum(ai_invocation.cost_usd) > cap; doesn't throw at exactly cap; warning at 80%.

---

## ADRs needed

> **Numbering corrected 2026-06-25:** next-available is **ADR-0066** (0061–0065 are taken: ai-chat, doc-extraction, templates, materials, chat-appearance). Verify before assignment. The biometric-lifecycle ADR amends **ADR-0014** (the PII boundary — its `## PII boundary` section + V1.15 amendment; filename `0014-response-data-model-and-conditioning.md`) and **ADR-0006** (sensitivity/privacy routing). The original "ADR-0014 — PII boundary" nickname was correct.

- **ADR-0066 — AI substrate: provider-adapter contract + invocation audit + metering (H0).** Locks: the widened `AIProviderAdapter` contract (typed, schema-validated ops; optional capability methods); the write-through gateway; the `ai_invocation` + `ai_invocation_payload` tables; `allow_pii_to_external_ai`; the per-workspace cost-cap primitive; the `ai-chat` retrofit. **This is the foundational ADR — land it first.** Completes what ADR-0006 designed.
- **ADR-0067 — Hume integration + AI-keys card extension (H1/H2).** Locks: BYOAI model; the three Hume keys stored encrypted; the `ai_provider_connection` migration (`0036`: `hume` in the CHECK + `secret_key` + `webhook_signing_key`); `ai.connections.test`/`usage`; `server/adapters/ai.hume.ts` adapter discipline (only it may import `@hume/*`); lock-in inventory updated.
- **ADR-0068 — Emotion analysis as a block-level option (H3a/H4a).** Locks: the shared `emotionAnalysis: { enabled, provider, modality }` config addition; the post-submit Inngest enqueue hook (voice) + sync-call (text); failure-handling; export-column shape.
- **ADR-0069 — `audio-stimulus` block + Octave TTS caching (H5).** Locks: the new registry block kind; the R2 cache key (hash of script + voice + emotional dimensions); per-condition variants; publish-time generation.
- **ADR-0070 — `voice-conversation` block + EVI WebSocket proxy (H6).** Locks: the proxy architecture (browser ↔ our server ↔ Hume); `ai_conversation` + `ai_conversation_turn` tables; `hume_evi_config` (we-manage configs); per-turn emotion logging; participant-audio retention default-off opt-in.
- **ADR-0071 — Biometric-data lifecycle + IRB acknowledgment (H6/H7).** Amends ADR-0006 (voice = `pii` routing) and ADR-0014 (withdraw cascade to `ai_invocation`/`ai_invocation_payload`/`ai_conversation`/`ai_conversation_turn`); locks the **new `study_publish_acknowledgment` table** (does not exist today), the per-block disclosure copy, and the study-level consent banner.

(Numbers above are the expected sequence from `0066`; confirm against `04_architecture/adrs/` at PR time and renumber if anything lands between now and then. Land each alongside the first PR of its stream, not as one batch.)

---

## Wireframes needed (phase-gate per CLAUDE.md)

| Wireframe | Section |
|---|---|
| `settings-ai-connections.md` (extend) | H1 |
| `settings-workspace-usage-ai.md` | H2, H8c |
| `block-audio-record-configure.md` (extend) | H3a |
| `block-voice-emotion-probe-configure.md` | H3b |
| `block-voice-emotion-probe-take.md` | H3b |
| `block-free-text-configure.md` (extend) | H4a |
| `block-text-emotion-probe-configure.md` | H4b |
| `block-text-emotion-probe-take.md` | H4b |
| `block-audio-stimulus-configure.md` | H5 |
| `block-audio-stimulus-take.md` | H5 |
| `block-audio-stimulus-results.md` | H5 |
| `block-ai-conversation-configure.md` | H6 |
| `block-ai-conversation-take-precall.md` | H6 |
| `block-ai-conversation-take-active.md` | H6 |
| `block-ai-conversation-results-detail.md` | H6 |
| `block-ai-conversation-results-aggregate.md` | H6 |
| `take-flow-biometric-consent.md` | H7a |
| `take-flow-block-emotion-disclosure.md` | H7b |
| `study-publish-irb-ai-acknowledgment.md` | H6, H7c |
| `study-publish-irb-emotion-acknowledgment.md` | H7c |
| `results-emotion-panel.md` | H8a |
| `export-builder-emotion-columns.md` | H8b |

22 wireframes — chunky, but most are short (configure-panel additions) and share a card-list scaffold. Front-load the H1/H2/H3a/H4a wireframes; the dedicated-block wireframes can land alongside their PRs.

---

## Sequencing PRs (~14–14.5 weeks total, 7 streams)

> Revised 2026-06-25: **H0 added as the lead stream** (+~1.5–2 weeks) and H1/H2 re-scoped. The original "~12.5 weeks" assumed the substrate existed; the honest figure with the substrate built is ~14–14.5 weeks. This is the cost of the high-quality, flexible foundation the owner chose — paid once.

**Stream H0 — AI substrate (~1.5–2 weeks) — MUST LAND FIRST:**
- PR H0.1: Widen the `AIProviderAdapter` contract (typed ops + optional capability methods + `ping`) (~3 days)
- PR H0.2: `ai_invocation` + `ai_invocation_payload` tables (migration `0036`) + write-through gateway + `allow_pii_to_external_ai` enforcement (~3 days)
- PR H0.3: Per-workspace cost metering (`ai.usage`) + `monthly_ai_budget_usd_cap` + cap/80%-warning primitive (~2 days)
- PR H0.4: Retrofit `ai-chat` (ADR-0061) onto the gateway + audit log; prove end-to-end (~2 days)

**Stream H1+H2 — Hume connection + adapter (~1.5 weeks):**
- PR H1.1: `ai_provider_connection` migration (`hume` in CHECK + `secret_key` + `webhook_signing_key`) + Hume row on the workspace AI-keys card + connect/disconnect + **new `test`/`usage`** procedures (~3 days)
- PR H2.1: `server/adapters/ai.hume.ts` implementing the H0 contract — `analyzeText` + `analyzeVoice` (flows through the H0 gateway; no separate audit table) (~5 days)
- PR H2.2: `synthesizeAudio` + `startConversation` adapter methods (land with H5/H6) (~2 days)

**Stream H3 — Voice emotion (~2 weeks):**
- PR H3a.1: Shared `emotionAnalysis` config addition + free-text/audio-record Configure UI + Builder picker (~2 days)
- PR H3a.2: `hume.analyze-voice` Inngest job + `recordAnswer` enqueue hook + retry/failure semantics (~3 days)
- PR H3b.1: `core/voice-emotion-probe@1.0.0` schema + Configure + Take + Results panel (~5 days)

**Stream H4 — Text emotion (~1 week):**
- PR H4a.1: Sync Hume text-emotion call on `recordAnswer` + `<EmotionResultsPanel>` integration (~3 days)
- PR H4b.1: `core/text-emotion-probe@1.0.0` schema + Configure + Take + Results (~2 days)

**Stream H5 — Octave TTS (~1.5 weeks):**
- PR H5.1: `core/audio-stimulus@1.0.0` schema + Configure + per-condition variants + generation flow + R2 cache (~5 days)
- PR H5.2: Take UI + playback controls + Results display (~3 days)

**Stream H6 — EVI ai-conversation (~3.5 weeks):**
- PR H6.1: WebSocket proxy infrastructure (browser ↔ our server ↔ Hume) + edge runtime decision + `ai_conversation` + `ai_conversation_turn` schema (~5 days)
- PR H6.2: `core/voice-conversation@1.0.0` schema + Configure (system prompt, voice, caps, audio-retention, IRB ack) (~3 days)
- PR H6.2b: We-manage EVI Configs API — `hume_evi_config` table + `createOrUpdateEVIConfig` adapter method + fingerprint-based reuse + delete-on-study-hard-delete (~3 days; owner-locked answer #1)
- PR H6.3: Take UI pre-call + active + transcript rendering + early-end handling (~5 days)
- PR H6.4: Per-response detail view + aggregate trajectory chart + CSV/Excel export (~2 days)

**Stream H7 — Consent + IRB gates (~1 week):**
- PR H7.1: Study-level biometric consent screen + per-block emotion-disclosure copy + withdraw-flow extension (~3 days)
- PR H7.2: Researcher IRB-acknowledgment publish gates (three flavors) + `study_publish_acknowledgment` extensions (~2 days)

**Stream H8 — Results + exports + workspace dashboard (~1 week):**
- PR H8.1: `<EmotionResultsPanel>` shared island + integration across H3a/H3b/H4a/H4b (~2 days)
- PR H8.2: Export builder emotion columns + ai-conversation turns sheet (~2 days)
- PR H8.3: Workspace AI usage dashboard + budget cap enforcement (~3 days)

**Cross-cutting PRs:**
- PR X1: ADRs (ADR-0066 substrate first, then 0067–0071 + the ADR-0006/0014 amendments) — land alongside the first PR of each stream that needs them, not as a single ADRs-batch PR
- PR X2: Manifest + `00_meta/manifest/schema.yaml` entries for 4 new block kinds; `validate.py` must return clean before any stream merges
- PR X3: e2e suite — `e2e/hume-voice-emotion.spec.ts` + `e2e/hume-text-emotion.spec.ts` + `e2e/hume-audio-stimulus.spec.ts` + `e2e/hume-ai-conversation.spec.ts` (all gated `RUN_HUME_E2E=1` against fixture-Hume); a separate live-Hume e2e for ai-conversation gated even more tightly because of WebSocket complexity

**Dependencies between streams:**

- **Everything depends on H0** (the contract + audit gateway + metering). Nothing Hume-facing can land before it.
- H1 + H2.1 depend on H0 (the widened contract + gateway).
- H3a + H4a depend on H1 + H2.1 (`analyzeText` + `analyzeVoice`).
- H3b + H4b depend on H3a + H4a (reuse the same Inngest job + sync-call code).
- H5 depends on H1 + H2.2 (`synthesizeAudio`).
- H6 depends on H1 + H2.2 (`startConversation`) + new WebSocket infrastructure.
- H7 depends on H3a + H6 (consent banner shape depends on which blocks the study contains).
- H8 depends on H0.3 (metering) + at least one analyzed-block stream.

So a clean ordering: **H0 → H1 → H2.1 → H3a → H4a → H3b/H4b/H5 in parallel → H2.2 → H6 → H7 → H8.**

---

## Open questions — fully resolved 2026-06-22 (owner answered all 7)

1. ✅ **EVI configuration model: we manage configs.** Option (b) locked. `hume_evi_config` table mirrors Hume's Config schema; block save calls `humeAdapter.createOrUpdateEVIConfig(...)`; `hume_config_id` persists in the block config. Researchers never leave MRT for EVI authoring. Adds ~3 days to H6 (scoped in). Full spec in H6 § "Hume Config management".
2. ✅ **Participant audio retention is per-block.** `participantAudioRetention: 'never' | 'session' | 'retained'` on `voice-conversation`, `voice-emotion-probe`, and `audio-record` (when emotion-option is on). Default `'session'` for the audio-collecting blocks (researchers expect to keep response audio for analysis), default `'never'` for EVI conversation. `'retained'` triggers escalated IRB-acknowledgment copy at publish time. Withdraw cascades regardless.
3. ✅ **10 vetted TTS presets in V2.1.** Curated list locked in H5; full Hume catalog picker = V2.2.
4. ✅ **$50/mo default AI budget cap on NEW workspaces; per-workspace overridable; existing workspaces get NULL.** Additive migration seeds the cap on rows created on/after the V2.1 release date. Owner can change any time in Settings · Workspace → Usage → AI.
5. ✅ **Keep both `text-emotion-probe` block and the free-text emotion option.** Different cognitive affordances; ship both.
6. ✅ **Researcher-facing branding YES, participant-facing branding NO (unless Hume TOS strongly requires).** Builder Configure / Connections list / Results / Usage dashboard show "Powered by Hume". Participant Take UI shows no Hume branding by default. **Pre-ship gate during PR H1.1:** read Hume's current TOS for participant-attribution requirements on generated audio (TTS); if attribution is mandatory on participant-played audio, surface a small "🔊 generated by Hume" tag under `audio-stimulus` playback only. Audit logged in `06_qa/audit-logs/<date>-v210-hume-tos-attribution-check.md` when the check completes.
7. ✅ **Workspace-level cost rollup only.** Usage dashboard rolls up to workspace; no per-researcher split column. Per-researcher attribution = V2.2+ scope.

All 12 owner-confirmed decisions (5 original + 7 from this round) are locked into the body sections above.

---

## Files to read first

1. This handoff start to finish, then [`code-tab-v210-hume-reconciliation.md`](code-tab-v210-hume-reconciliation.md).
2. `04_architecture/adrs/0006-ai-plugin-architecture.md` (*Task-based AI architecture with provider adapters*) — the substrate H0 **completes**; it was designed here but never built. Read Option B closely.
3. `04_architecture/adrs/0007-path-a-vs-b.md` + `lock-in-inventory.md` — adapter discipline + cost-ceiling triggers.
4. `04_architecture/adrs/0014-response-data-model-and-conditioning.md` — the response/withdraw data model **and the PII boundary** (its `## PII boundary` section + V1.15 amendment) that H0/H7 cascade through. (This is the "ADR-0014 — PII boundary" the original draft meant; just the real filename. Sensitivity *routing* is additionally in ADR-0006.)
5. `04_architecture/adrs/0016-production-deployment-architecture.md` §6 — `TOKEN_ENCRYPTION_KEY` discipline (used by `server/crypto/tokens.ts`).
6. `04_architecture/adrs/0003-asset-storage.md` — R2 `ws/` (TTS cache) vs `resp/` (participant audio).
7. `05_app/server/adapters/ai.ts` + `ai.anthropic.ts` — the current (minimal) adapter H0 widens.
8. `05_app/server/trpc/routers/ai.ts` + `components/feature/settings/ai-provider-settings.tsx` — the connect surface H1 extends (workspace-scoped).
9. `05_app/server/adapters/recruitment.prolific.ts` — closest PAT connect precedent for Hume.
10. `05_app/server/db/schema.ts` — `aiProviderConnection`; existing `response`/`response_item` tables (note: **no `ai_invocation` yet** — H0 adds it).
11. `05_app/server/modules/registry.ts` — how blocks are defined (`audio-record`, `free-text`, `social-post`); the 4 new blocks are registry entries here + components under `components/feature/{take,builder}` (there is no `components/blocks/` dir).
12. `05_app/server/jobs/registry-push.ts` — model the `hume.analyze-voice` Inngest job on this; `seed-core.ts` for the seeding pattern.
13. Hume docs to read before adapter implementation:
    - https://dev.hume.ai/docs/expression-measurement-api/overview
    - https://dev.hume.ai/docs/empathic-voice-interface-evi/overview
    - https://dev.hume.ai/docs/text-to-speech-tts/overview
    - https://dev.hume.ai/reference/expression-measurement-api/batch/start-inference-job (the batch endpoint we'll likely use for voice; verify there's a sync endpoint for short clips)
    - https://dev.hume.ai/reference/empathic-voice-interface-evi/chat (the EVI WebSocket reference)

---

## What's NOT in V2.1 (deferred)

- **Face-emotion analysis.** Requires video capture, which we don't have today. Revisit V2.2+ if a video-stimulus or video-response block is on the roadmap.
- **Hume Custom Models API.** Researchers training their own emotion models. Power-user tier; defer V2.2+.
- **Real-time emotion overlay during participant runtime (researcher live-view).** Privacy-concerning; researchers watching participants live emotion would be a surveillance-flavored UX. Skip unless explicit demand.
- **Managed-AI cost model (we eat the Hume bill).** V2.1 is BYOAI only. A managed tier would be V3.x business-model work.
- **Per-study (not per-workspace) Hume keys.** Workspaces share one Hume connection across all studies. If labs want per-study isolation (different IRB protocols, etc.), that's V2.2+ scope.
- **Cross-workspace emotion-model comparison.** "How does this study's emotion data compare to similar published studies?" Future replication-network feature.
- **Auto-redaction of voice for compliance.** Removing identifying info from recordings before Hume processes. Compliance-heavy; defer until a real user demand surfaces.
- **Hume's tool-use feature in `voice-conversation`.** EVI agents can call functions. Cool but adds complexity (validation, security, state-transitions); V2.2+.
- **Multi-language Hume support beyond defaults.** Hume supports many languages; V2.1 ships English-first with `language` parameter exposed in the adapter but the Builder UI defaults to English. Per-block language picker = V2.2+.
- **Sona Systems integration** (separate concern — that's V1.17 Participants extension, not Hume-related).

When green: ping owner. Owner runs a multi-block smoke test (record audio → see emotion bars; write text → see emotion bars; play generated audio stimulus; complete a short EVI conversation; verify withdraw cleans everything); signs the audit log; tags `v2.1.0`.
