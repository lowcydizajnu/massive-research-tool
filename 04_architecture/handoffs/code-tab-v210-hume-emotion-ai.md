# Code tab handoff — V2.1 Hume emotion AI (drafted 2026-06-22 — owner scope-locked)

> **V2.1 = Hume emotion-AI as an option on existing applicable blocks + four new dedicated blocks.** This is the second AI release after V2.0 (text-LLM substrate: measure picker, literature→blocks, hypothesis extraction). V2.1 introduces a **second AI vendor** with a different sensitivity profile — Hume analyzes voice/text/face emotion and generates emotional audio. Estimated **~12 weeks Code-tab time** across 6 PR streams. **BYOAI model locked** (researcher provides their own Hume API token; mirrors OSF/Prolific connect pattern).
>
> **Scope-locked 2026-06-22:** none of #3 (Octave TTS) or #4 (EVI conversational interface) is deferred — all four feature families ship in V2.1. Emotion analysis is offered as an OPTION on all existing applicable blocks (any free-text input + any audio record) AND as four dedicated new block kinds.

V2.1 unblocks **emotion-as-a-measure** for psychological research. Today researchers can collect audio responses (V1.12 `core/audio-record@1.0.0`) and free-text responses (V1.6 `core/free-text@1.0.0`), but the only signal they extract is the raw content + manual coding. V2.1 turns every voice and text response into a structured emotion-vector measure, and adds two new stimulus modalities (emotion-controlled TTS + voice-conversation-with-AI) that are impossible without specialized infrastructure.

---

## Owner-confirmed decisions (locked 2026-06-22)

1. ✅ **BYOAI model.** Researcher connects their own Hume account via PAT in Settings · Account → AI Connections. We never proxy through a shared/managed Hume key. Same pattern as the V1.7 OSF and V1.15 Prolific connect flows.
2. ✅ **Option on existing blocks AND dedicated new blocks.** Both surfaces ship. The option is a checkbox on every applicable existing block; the dedicated blocks are first-class new kinds that put emotion at the center of the response design.
3. ✅ **All four feature families in scope.** Voice emotion (Feature #1) + text emotion (Feature #2) + Octave TTS stimulus (Feature #3) + EVI ai-conversation (Feature #4) all ship in V2.1. No deferrals.
4. ✅ **Adapter discipline holds.** No `@hume/*` import outside `05_app/server/adapters/ai.hume.ts` per ADR-0007.
5. ✅ **Sensitivity tier respects ADR-0006 + ADR-0014.** Voice = `pii` (biometric); text = `participant_data`; face = explicitly out-of-scope for V2.1 (no video capture today; revisit V2.2+). Withdraw flow per ADR-0014 cascades to the `ai_invocation` audit table.

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| ADR-0006 AI plug-in substrate | `AIProviderAdapter` interface; `ai_invocation` audit table; sensitivity-tag routing; per-workspace toggle pattern. Locked in V1.5/V2.0 prep work. | `04_architecture/adrs/0006-ai-plugin-architecture.md` |
| OSF Connections sub-view | Settings · Account → Integrations → OSF; PAT input; encrypted at rest (`TOKEN_ENCRYPTION_KEY`); test-connection button. | `05_app/app/(account)/account/integrations/page.tsx` + `server/adapters/registry.osf.ts` |
| Prolific Connections sub-view | Mirror of OSF pattern; PAT input; encrypted; per-workspace enable toggle. | `05_app/app/(workspace)/participants/connections/page.tsx` + `server/adapters/recruitment.prolific.ts` |
| `core/audio-record@1.0.0` | Browser MediaRecorder; R2 upload; per-response audio key stored in `response_item.answer.audioKey`. V1.21.x. | `05_app/components/blocks/audio-record/` + `server/storage/r2.ts` |
| `core/free-text@1.0.0` | Short/long text variants; maxLength; `responseSchema {text}`. V1.6. | `05_app/components/blocks/free-text/` |
| `core/long-text` (V1.12 expansion) | Multi-paragraph response variant; same emotion-eligible shape. | `05_app/components/blocks/long-text/` |
| `core/social-post@2.0.0` | Has a participant-comment field (free-text); emotion-eligible. | `05_app/components/blocks/social-post/` |
| R2 storage (ADR-0003) | `ws/` (public, unauthenticated, cheap) + `resp/` (workspace-ownership-gated); V1.40.0 hardened the `resp/` path. Audio responses live in `resp/`. | `server/adapters/storage.r2.ts` |
| `token_encryption_key` discipline | Permanent ledger key per ADR-0016 §6; never rotate; OSF/Prolific tokens already encrypted with it. | env + `lib/crypto/token-encryption.ts` |
| Withdraw flow | Per ADR-0014: participant deletion cascades through `response`, `response_item`, R2 audio keys, `recruitment_session`, and (after this release) `ai_invocation`. | `server/workers/withdraw-participant.ts` |
| Activity destination (V1.7) | Emits per-action events; emotion-analysis events will join this surface. | `server/events/` |
| Cost-ceiling pattern (ADR-0007) | Workspace-level $200/mo plan + $500/mo execute per managed service; instrumented via vendor-invocation rows. | (no central UI yet — V2.1 adds the dashboard widget) |

## What's missing (the V2.1 build)

- AI Connections sub-view at `Settings · Account → AI Connections` (currently no AI-vendor connect surface; V2.0 will add the shell — V2.1 adds the Hume row)
- `server/adapters/ai.hume.ts` (the only repo file allowed to import `@hume/*` per ADR-0007)
- `ai_invocation` table is in ADR-0006 spec but not yet migrated (V2.0 lands the migration; V2.1 extends with Hume-specific columns)
- Optional `analyzeEmotion: boolean` flag on every applicable existing block + the post-submit Inngest job that processes audio/text → Hume → result
- 4 new block kinds: `core/voice-emotion-probe@1.0.0`, `core/text-emotion-probe@1.0.0`, `core/audio-stimulus@1.0.0`, `core/ai-conversation@1.0.0`
- Biometric-consent layer above V1.5 GDPR consent (per-study + per-block surfacing)
- IRB-acknowledgment gate for Hume-using studies (mirrors V1.12 mimicking-presets pattern)
- Emotion-vector results display (charts + per-condition distributions)
- CSV/Excel export columns for emotion vectors
- Workspace-level Hume usage + cost meter (Settings · Workspace → Usage → AI section)

---

## Section H1 — AI Connections sub-view + Hume PAT flow (~3 days)

**Route:** `Settings · Account → AI Connections` (new sub-view; V2.0 ships the shell with Claude/GPT/etc. rows — V2.1 adds the Hume row to that table).

### What it looks like

Each AI provider is a row:

| Provider | Status | Last used | Actions |
|---|---|---|---|
| Anthropic Claude (text) | Connected | 2 days ago | Disconnect / Test |
| OpenAI GPT (text) | Not connected | — | Connect |
| **Hume (emotion + voice)** | **Not connected** | — | **Connect** |

### Connect-Hume flow

Clicking **Connect** opens a modal:

- Field 1: **Hume API key** (PAT — read at https://platform.hume.ai/settings/keys)
- Field 2: **Hume Secret key** (Hume's auth uses both; required for EVI WebSocket)
- Read-only info box: "Your key is encrypted at rest using `TOKEN_ENCRYPTION_KEY`. We never log raw keys. Disconnecting deletes the encrypted key but does not revoke it on Hume's side — do that separately at platform.hume.ai."
- **Test connection** button: calls `humeAdapter.ping()` (a no-cost endpoint — Hume has a `/v0/me` or equivalent that returns the account holder); shows "Connected as: {account email}" on success.
- Submit → encrypts both keys, writes one row to `ai_connection` table (`workspace_id`, `provider='hume'`, `encrypted_api_key`, `encrypted_secret_key`, `connected_by_user_id`, `connected_at`), redirects back to the AI Connections list.

### Data shape

```sql
CREATE TABLE ai_connection (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'hume')),
  encrypted_api_key TEXT NOT NULL,           -- AES-256-GCM via TOKEN_ENCRYPTION_KEY
  encrypted_secret_key TEXT,                 -- nullable; only Hume requires both today
  connected_by_user_id UUID NOT NULL REFERENCES user(id),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (workspace_id, provider)
);
```

(`ai_connection` is V2.0's table; V2.1 only adds the `hume` enum value + `encrypted_secret_key` column. Both additive.)

### tRPC procedures

- `aiConnections.list()` — returns rows for the active workspace (decrypted keys never leave the server).
- `aiConnections.connect({ provider: 'hume', apiKey, secretKey })` — workspace-admin only; writes the row.
- `aiConnections.disconnect({ provider })` — workspace-admin only; deletes the row.
- `aiConnections.test({ provider })` — calls the adapter's `ping()` method.

### Wireframe gate

`03_design/wireframes/settings-ai-connections.md` (extend the V2.0 wireframe to include the Hume row).

### Tests

- Unit: encrypt → decrypt round-trips correctly.
- Unit: `disconnect` deletes the row but doesn't touch upstream Hume keys.
- e2e: connect → test → see "Connected as: …" → disconnect → row gone.

---

## Section H2 — `AIProviderAdapter` extension + Hume implementation (~4-5 days)

The substrate is V2.0's. V2.1 only adds:

- One adapter file: `05_app/server/adapters/ai.hume.ts` (the only file in the repo allowed to import `@hume/*`).
- Schema extensions on the existing `ai_invocation` audit table (additive columns; no migration of existing rows).
- A `humeAdapter` factory that takes a decrypted `{ apiKey, secretKey }` and returns the typed interface below.

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

### `ai_invocation` extensions

Additive columns on the V2.0 table:

```sql
ALTER TABLE ai_invocation
  ADD COLUMN modality TEXT CHECK (modality IN ('text', 'voice', 'tts', 'conversation')),
  ADD COLUMN duration_ms INTEGER,
  ADD COLUMN result_summary JSONB;        -- top-3 emotions + valence/arousal; full vector lives in ai_invocation_payload (R2-backed for size)
```

`ai_invocation_payload` is a small R2-backed sidecar table (key + R2 pointer) for the full emotion vectors + transcripts; raw audio responses already live in `resp/` per ADR-0003.

### Cost metering

Each invocation writes `cost_usd` (computed from the response headers Hume returns or — for TTS — from the script length). Workspace usage rolls up via `aiConnections.usage({ provider, range })` → Settings · Workspace → Usage → AI section.

### Sensitivity routing (per ADR-0006)

`AIInvocationContext.sensitivity` is one of: `researcher_content` | `participant_data` | `pii`. The adapter refuses calls when the per-workspace setting `allow_pii_to_external_ai` is false (default: false; researcher must explicitly enable in the AI Connections row).

### Wireframe gate

`03_design/wireframes/settings-workspace-usage-ai.md` (cost meter + per-modality breakdown).

### Tests

- Unit: each adapter method mocks the Hume HTTP/WebSocket and returns the typed shape.
- Unit: a call with `sensitivity: 'pii'` against a workspace with `allow_pii_to_external_ai: false` throws `HumePIIBlockedError`.
- Integration: a single end-to-end `analyzeText` call against the real Hume API (gated env var `RUN_HUME_E2E=1`).

---

## Section H3 — Voice emotion analysis: option on existing blocks + dedicated probe block (~2 weeks)

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
};
```

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
- **Voice preset** (`narrator-neutral` / `narrator-warm` / `narrator-urgent` / `narrator-anxious` / `peer-casual` / `peer-skeptical` / `authority-formal` — researcher-friendly names mapping to Hume Octave voice IDs)
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

## Section H6 — `core/ai-conversation@1.0.0` (EVI conversational interface, new dedicated block) (~3 weeks)

The most ambitious block in V2.1. Participant has a real-time voice conversation with a Hume EVI-powered AI agent; researcher gets full transcript + per-turn emotion vectors for both sides.

### Researcher Builder config

- **System prompt** (multi-line; defines the agent's personality, topic, goal, constraints)
- **Voice** (Hume voice preset — same picker as H5)
- **Duration cap** (1-15 minutes; default 5; hard stop)
- **Turn cap** (5-50 turns; default 20)
- **Agent's starting line** (optional — what the agent says first; default: agent waits for participant)
- **Allowed topics / forbidden topics** (free-text lists; surfaced to the agent as additional system-prompt constraints)
- **Tools the agent can use** (V2.1: none; V2.2+: could pass back to study state — e.g., agent can "mark participant as eligible for follow-up question X")
- **Participant-visible transcript?** (default: yes; shows the chat-style history during the call)
- **Allow participant to end early?** (default: yes; button "End conversation")
- **IRB acknowledgment gate**: checkbox "I have IRB approval or equivalent for AI-mediated participant interaction" — required before researcher can publish a study using this block (mirrors V1.12 mimicking-presets pattern)

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

When publishing a study containing an `ai-conversation` block:

- Publish-time check: "This study uses AI-mediated voice conversation. Confirm you have IRB approval or equivalent for this interaction." Researcher confirms by checking the box; publish-action records the acknowledgment in `study_publish_acknowledgment` table (already exists since V1.12 mimicking-presets).
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
2. **Any `ai-conversation` block:** the stronger gate (per H6) about AI-mediated interaction.
3. **Any `audio-stimulus` block with emotional dimensions outside the neutral baseline:** "I have IRB approval to deliver emotionally-charged audio stimuli to participants. [confirmed]" (mirrors V1.12 mimicking-presets exactly)

All three gates write to `study_publish_acknowledgment`; each ack is timestamped + linked to the publishing user + survives study forking (forked studies require fresh acknowledgment by the new owner).

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
- Budget alert: workspace-owner-configurable monthly cap. When crossed, the next AI invocation throws `WorkspaceAICapExceeded` with a friendly message; researcher sees a notice + can raise the cap or wait until next month.

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

- **ADR-00XX — Hume integration + AI Connections shell.** Locks: BYOAI model; PAT + secret key stored encrypted; the `ai_connection` table; `aiConnections` tRPC router; the workspace-level `allow_pii_to_external_ai` toggle; adapter discipline (only `server/adapters/ai.hume.ts` may import `@hume/*`); lock-in inventory updated. Supersedes nothing.
- **ADR-00XX — Emotion analysis as block-level option.** Locks: the shared `emotionAnalysis: { enabled, provider, modality }` config addition across applicable block kinds; the `recordAnswer` Inngest enqueue hook (voice) + sync-call pattern (text); failure-handling semantics; export-column shape.
- **ADR-00XX — `core/audio-stimulus@1.0.0` + Octave TTS caching.** Locks: the new block kind; the R2 cache key derivation (hash of script + voice + emotional dimensions); per-condition variant model; publish-time generation flow.
- **ADR-00XX — `core/ai-conversation@1.0.0` + EVI WebSocket proxy.** Locks: the proxy architecture (browser ↔ our server ↔ Hume); the `ai_conversation` + `ai_conversation_turn` tables; per-turn emotion logging; the IRB-acknowledgment gate (mirrors V1.12 mimicking-presets); participant-audio retention default-off, opt-in.
- **ADR-0014 amendment — Biometric-data lifecycle.** Voice = `pii` sensitivity; withdraw cascades to `ai_invocation`, `ai_invocation_payload` (R2-backed), `ai_conversation`, `ai_conversation_turn`; per-block disclosure copy + study-level consent banner; researcher IRB-acknowledgment.
- **ADR-00XX — AI cost metering + workspace caps.** Locks: per-invocation `cost_usd` write; workspace monthly cap; warning at 80%; hard-stop at 100%; usage dashboard schema.

(Six ADRs total. Assign sequential numbers at PR time; current next-available is ADR-0061 per STATUS but verify before assignment.)

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

## Sequencing PRs (~12 weeks total, 6 streams)

**Stream H1+H2 — Foundation (~2 weeks):**
- PR H1.1: `ai_connection` schema extension + AI Connections row for Hume + connect/disconnect/test flow (~3 days)
- PR H2.1: `server/adapters/ai.hume.ts` shell + `analyzeText` + `analyzeVoice` adapter methods + `ai_invocation` extension + cost metering (~5 days)
- PR H2.2: `synthesizeAudio` + `startConversation` adapter methods (deferred until streams H5/H6 need them — can split or land together) (~2 days)

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

**Stream H6 — EVI ai-conversation (~3 weeks):**
- PR H6.1: WebSocket proxy infrastructure (browser ↔ our server ↔ Hume) + edge runtime decision + `ai_conversation` + `ai_conversation_turn` schema (~5 days)
- PR H6.2: `core/ai-conversation@1.0.0` schema + Configure (system prompt, voice, caps, IRB ack) (~3 days)
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
- PR X1: ADRs (6 new + ADR-0014 amendment) — land alongside the first PR of each stream that needs them, not as a single ADRs-batch PR
- PR X2: Manifest + `00_meta/manifest/schema.yaml` entries for 4 new block kinds; `validate.py` must return clean before any stream merges
- PR X3: e2e suite — `e2e/hume-voice-emotion.spec.ts` + `e2e/hume-text-emotion.spec.ts` + `e2e/hume-audio-stimulus.spec.ts` + `e2e/hume-ai-conversation.spec.ts` (all gated `RUN_HUME_E2E=1` against fixture-Hume); a separate live-Hume e2e for ai-conversation gated even more tightly because of WebSocket complexity

**Dependencies between streams:**

- H3a + H4a both depend on H1 (AI Connections + Hume row) + H2.1 (adapter shell with `analyzeText` + `analyzeVoice`).
- H3b + H4b depend on H3a + H4a (reuse the same Inngest job + sync-call code).
- H5 depends on H1 + H2.2 (`synthesizeAudio` adapter method).
- H6 depends on H1 + H2.2 (`startConversation`) + a small chunk of new WebSocket infrastructure.
- H7 depends on H3a + H6 (consent banner shape depends on which blocks the study contains).
- H8 depends on at least one analyzed-block stream having landed.

So a clean ordering: **H1 → H2.1 → H3a → H4a → H3b/H4b/H5 in parallel → H2.2 → H6 → H7 → H8.**

---

## Open questions for the owner

1. **Hume EVI configuration model.** Hume's EVI lets researchers create "Configs" (system prompt + voice + tools + tool-use config) on Hume's side, then reference by `config_id` from API. Two options:
   - (a) Researcher creates EVI configs directly on platform.hume.ai and pastes the config_id into our Builder. Less control for us; more transparency to researcher.
   - (b) We create + manage configs via Hume's API on behalf of the researcher (one config per `ai-conversation` block instance). More integrated; more code; we have to mirror Hume's config schema in our DB.
   - **Recommendation: (a) for V2.1 (faster ship, simpler mental model), (b) as V2.2 polish if researchers complain.** Lock?
2. **Participant audio retention for `ai-conversation`.** Default off (privacy-minimizing) — we keep transcripts + emotion vectors but discard raw participant audio after Hume processes it. Researcher can opt in to retain raw audio (with disclosure to participant). **Confirm default-off + opt-in?**
3. **TTS voice presets — researcher-friendly names or Hume IDs?** Hume Octave has internal voice IDs like `ito-narrator-warm-001`. Our Builder needs friendlier names (`narrator-warm` / `narrator-neutral` / etc.). Should we ship a fixed list of, say, 10 vetted presets (researcher-friendly names mapped internally), or expose all of Hume's voices via a search picker? **Recommendation: ship 10 vetted in V2.1; full picker in V2.2.**
4. **Workspace AI budget caps — opt-in or default?** Should new workspaces get a default monthly cap (e.g., $50/mo) auto-set, or zero cap until owner enables? **Recommendation: default $50 cap on new workspaces (forces conscious opt-in to higher spend); existing workspaces get no default cap (don't surprise current users).**
5. **`text-emotion-probe` overlap with `free-text` + emotion option.** Are these meaningfully different to researchers, or is the dedicated block redundant? **Recommendation: ship both — the dedicated block puts emotion-as-primary in the Builder/Results affordance, which is a real cognitive difference even if the underlying data is similar. Researchers picking it know they're emotion-first; researchers using the option are augmenting an existing measure.** Confirm?
6. **Should `audio-stimulus` participants see Hume branding?** Hume's TOS may require attribution ("audio generated by Hume AI"). Need to check the TOS before shipping; if required, surface a small "🔊 generated by Hume" tag under the player. Or pay for white-label tier if available.
7. **Pricing the cost passthrough.** BYOAI means researcher pays Hume directly — but the Hume API key is workspace-scoped, so all researchers in a workspace share one bill. Should we surface per-researcher attribution in the Usage dashboard (researcher X spent $Y this month) or only roll up to workspace level? **Recommendation: per-researcher attribution — workspace owners want to know who's expensive. Cheap to add.**

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/adrs/0006-ai-plugin-architecture.md` — the substrate this builds on; V2.0 lands the table + adapter interface; V2.1 extends.
3. `04_architecture/adrs/0007-path-a-vs-b.md` + lock-in inventory — adapter discipline + cost-ceiling triggers.
4. `04_architecture/adrs/0014-pii-boundary.md` — voice + biometric handling; this handoff proposes an amendment.
5. `04_architecture/adrs/0016-production-deployment-architecture.md` §6 — `TOKEN_ENCRYPTION_KEY` discipline.
6. `04_architecture/adrs/0003-asset-storage.md` — R2 `ws/` (TTS-generated audio cache) vs `resp/` (participant response audio); V1.40.0 amendment.
7. `05_app/server/adapters/registry.osf.ts` — the pattern for OAuth-y connect flow + token encryption.
8. `05_app/server/adapters/recruitment.prolific.ts` — the pattern for PAT-only connect flow (closer to Hume).
9. `05_app/server/db/schema.ts` — `ai_invocation` table once V2.0 lands; existing `response`/`response_item`/`recruitment_session` tables.
10. `05_app/components/blocks/audio-record/` — the existing voice-capture block; H3a extends it.
11. `05_app/components/blocks/free-text/` — H4a extends it.
12. `05_app/scripts/dev/seed-network-demo.ts` — dev seeder pattern; we'll want a `seed-hume-fixtures.ts` for the e2e suite (fixture audio + fixture Hume responses).
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
- **Hume's tool-use feature in `ai-conversation`.** EVI agents can call functions. Cool but adds complexity (validation, security, state-transitions); V2.2+.
- **Multi-language Hume support beyond defaults.** Hume supports many languages; V2.1 ships English-first with `language` parameter exposed in the adapter but the Builder UI defaults to English. Per-block language picker = V2.2+.
- **Sona Systems integration** (separate concern — that's V1.17 Participants extension, not Hume-related).

When green: ping owner. Owner runs a multi-block smoke test (record audio → see emotion bars; write text → see emotion bars; play generated audio stimulus; complete a short EVI conversation; verify withdraw cleans everything); signs the audit log; tags `v2.1.0`.
