# Wireframe spec — AI Connections (workspace AI provider keys)

- **Serves user flow:** [Manage account settings](../../02_product/user-flows/manage-account-settings.md) (connect-a-service pattern; here at workspace scope)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Settings · Workspace → AI provider card (`/settings/workspace`)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A workspace connects its **own** AI provider keys (BYO-key; ADR-0061/0066, Hume per ADR-0067) so AI blocks bill to the workspace's account, never a shared key. V1.16 shipped a single Anthropic card; V2.1 H1 generalizes it to a **list of providers** and adds **Hume** (emotion + voice), which needs three keys and a Test action. Keys are validated against the correct vendor, encrypted at rest (`TOKEN_ENCRYPTION_KEY`), and never read back — only a masked hint + status.

## Layout

One **card per provider**, stacked, inside the existing Workspace-settings center column. Each card is self-contained (header row + description + body that swaps between the connected view and the connect form). No modal — the connect form is inline (mirrors the recruitment-provider + Anthropic pattern already shipped) so the surface stays flat per brief v0.6.

## Content inventory

- **Section heading** — "AI providers" + one-line "Connect your own provider keys; usage is billed to your account."
- **Provider card — Anthropic (Claude)** — Sparkles icon + name; status pill (Connected / Not connected); description; connected view (masked hint `•••• 1a2b` + added-date + Disconnect + Test) OR connect form (one password field `sk-ant-…` + Connect); help line ("Get a key at console.anthropic.com → API Keys").
- **Provider card — Hume (emotion + voice)** — same shell, but:
  - Status pill gains an **error** state (red `Needs attention`) when a Test fails.
  - Connect form has **three** password fields, labelled **API key**, **Secret key**, **Webhook signing key**, each with its purpose in helper text; a single Connect button (disabled until all three non-empty).
  - Description names what Hume powers (voice/text emotion analysis, emotional TTS, voice conversation — V2.1) and that all three keys come from platform.hume.ai → Settings → Keys.
  - Connected view: masked API-key hint + added-date + **Test** + Disconnect. (Secret/webhook keys are never echoed, not even as hints.)
- **Test result line** — under the connected view: success → green "Connected as {account}" (or just "Connection OK" when the provider returns no account); failure → red "Couldn't reach {provider} — check the key."
- **Permission note** — viewers see "Ask a workspace admin to connect an AI provider" instead of any form/buttons (write-gated).

## States

- **Not connected** — connect form shown (admins) / permission note (viewers).
- **Connecting** — Connect button → spinner "Checking…"; validates against the vendor; on reject, inline red error.
- **Connected** — masked hint + Disconnect + Test.
- **Testing** — Test button → spinner "Testing…"; result line appears.
- **Test failed** — status pill flips to `Needs attention` (red); result line explains; key stays stored (researcher can re-Test after fixing it on the vendor side).
- **Hume — incomplete keys** — Connect disabled until all three fields filled; server also rejects with a clear message as a backstop.

## Interactions

- **Connect (Anthropic)** — `ai.connections.connect({ provider:'anthropic', apiKey })`; on success clears the field + shows connected view.
- **Connect (Hume)** — `ai.connections.connect({ provider:'hume', apiKey, secretKey, webhookSigningKey })`; same.
- **Test** — `ai.connections.test({ provider })` → pings the stored key; updates the status pill + result line; the server flags the row `error` on failure so the pill persists across reloads.
- **Disconnect** — `ai.connections.disconnect({ provider })`; returns the card to the connect form. Note: this deletes the stored keys here but does not revoke them on the vendor side.

## Edge cases

- **Very long account email** in the Test result ("Connected as …") — truncate with ellipsis, don't wrap the card.
- **A key pasted with surrounding whitespace** — trimmed before send (server also trims/min-length validates).
- **Hume Test passes but the Secret/Webhook keys are wrong** — the API-key `ping` (TTS voices) only proves the API key; Secret/Webhook keys aren't exercised until H6 voice-conversation. The card notes Test covers the API key only.
- **Provider returns no account identity** (Hume, Anthropic) — show "Connection OK" rather than an empty "Connected as".
- **Disconnect then reconnect** — single row per (workspace, provider); reconnect replaces in place (no duplicate cards).
- **Stale list after connect/disconnect/test** — invalidate `ai.connections.list` so the status pill + view update without reload.

## Accessibility notes

- Each provider card is a labelled region (`aria-labelledby` the provider name); status pill text is real text, not colour-only (colour + word).
- The three Hume key fields are separate `<label>`-associated `type="password"` inputs with `autoComplete="off"`; focus order top→bottom, Connect last.
- The Test result line is an `aria-live="polite"` region so screen readers announce success/failure.
- Disabled Connect (incomplete Hume keys) sets `aria-disabled` + a hint, not a silent dead button.

## Open questions

- Should a failed Test surface *which* key is suspected when Hume adds Secret/Webhook exercising in H6? (Deferred to H6.)
- Per-provider "last tested" timestamp in the connected view — useful, but deferred unless requested.

## Notes / non-goals

- No participant-facing surface (researcher-only, per owner-locked answer #11).
- The **budget cap + usage** UI is a separate card (V2.1 H8c, `settings-workspace-usage-ai.md`) — this spec is connections only.
- Tokens/colors by name only (v0.6 lock); reuse `PendingButton`, the success/danger subtle tokens, and the existing card scaffold.
