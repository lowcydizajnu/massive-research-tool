# ADR 0099 — Study variables — participant-entered values reused in-run

- **Status:** accepted
- **Date:** 2026-07-07
- **Deciders:** Paweł Rosner
- **Tags:** runtime, take, privacy, stimulus, variables

## Context

The simulated-app-environment family (Notification ADR-0095, Modal ADR-0096, Login ADR-0098) needs a value the participant *enters* in one block to be reused elsewhere in the same run — the motivating case named across those ADRs' revisit triggers: **the username typed at a fake login should appear personalised later** (in a nav bar, in a notification's text). This is a deception/immersion technique — "you are signed in as *cooluser*" makes the fake environment feel real.

This collides with two hard constraints. **ADR-0014** forbids participant PII at rest. **ADR-0098** deliberately made the login record *nothing* the participant types (the credential inputs carry no `name`, so their values never reach the server or DB) precisely because a username can be a real email. The owner's direction (2026-07-07) resolves the tension: the username should be usable **at runtime only** — to customise messages/blocks and show a signed-in bar — but **never exported and never in any dataset**; the export keeps only the existing 1/0 "did they type a username" signal.

No variable/interpolation engine exists today. The only participant-scoped store is `response.clientMetadata.embedded` (URL params captured at start, ADR-0042); text interpolation exists only for chrome (`{n}`/`{total}` progress, `{ext_id}` panel redirects). There is no way to carry a participant-entered value across screens or drop it into participant-facing copy.

## Options considered

### Option A — Persist the value server-side (`response.clientMetadata.variables`), interpolate on the server

- The login submits the username (a named field); the server stores it and every later screen interpolates `{username}` server-side; purge on completion; exclude from export.
- **Pros:** robust server-side interpolation into *any* block text; no client hydration flash; branch conditions could read it.
- **Cons:** the value **reaches the server and rests in the DB** during the run — the exact thing ADR-0098 built the nameless-input construction to prevent. "Runtime-only" becomes a purge policy we must get right (abandoned responses never purge). Breaks ADR-0098's guarantee-by-construction. **Rejected** — it trades a structural guarantee for a procedural one.

### Option B — Client-only carry (sessionStorage), interpolate on the client (chosen)

- The typed username is captured **client-side** into a `sessionStorage` carry (same pattern as the persistent-notification carry, ADR-0095 am.) and **never submitted** — the login inputs stay nameless, so ADR-0098's guarantee holds unchanged. A small client hydrator swaps `{var}` tokens in the rendered DOM; a signed-in-bar host renders into `#take-topbar`.
- **Pros:** the value **never reaches the server, the DB, or any export** — "runtime-only" is true *by construction* (same-tab sessionStorage, cleared on tab close), not by a purge job. Preserves ADR-0098 exactly. Reuses a proven pattern.
- **Cons:** interpolation is client-side (a one-frame hydration swap before it resolves); same-tab only; not available to server-side branch conditions. All acceptable for a display/immersion feature.

### Option C — A dedicated variable-setting block + server store

- A new block type produces variables; a normalized table holds them.
- **Cons:** heavyweight; a new table + join; server persistence reintroduces the PII-at-rest question. **Rejected** for now — Option B covers the need without new storage.

## Decision

**We add a client-only "study variables" carry: participant-entered values held in `sessionStorage` for the duration of a run, interpolated into participant-facing text as `{name}` tokens and surfaced in a signed-in nav bar — never sent to the server, never stored in the DB, never exported.**

- **Store.** `lib/take/study-variables.ts` — a `sessionStorage` map keyed by `responseId` (mirrors `notification-carry.ts`): `{ vars: Record<name,value>, bar: { template } | null }`. Client-only; no-ops during SSR. Cleared when the tab closes (one run).
- **First producer — the Login block (ADR-0098 am.).** A new `captureUsername` config (default **on**) + `usernameVar` name (default `username`). When the participant submits the login, the client island reads the username input's value and writes it to the carry **before** advancing. The input keeps **no `name`** — the value never enters the form POST, the server, or the DB (ADR-0098 unchanged). The password is never captured, full stop.
- **Reference syntax.** `{name}` (single brace, matching the app's existing `{n}`/`{ext_id}` convention; distinct from Prolific's `{{%…%}}`). Interpolation replaces only **known** variable names, so unrelated braces in stimulus are left untouched. Replacement is done via text-node `data`/React text children — never `innerHTML` — so a value like `<script>` can't inject.
- **Consumers (this build):** (1) a **signed-in nav bar** host (`study-variable-bar.tsx`) rendering the researcher's `signedInTemplate` into `#take-topbar` on screens after login; (2) a **client hydrator** (`study-variable-hydrator.tsx`) that swaps known `{var}` tokens in the take DOM (covers notification/modal text *and* general block prompts uniformly, so those renderers are untouched), self-healing via a `MutationObserver`, skipping form controls / `<script>` / `<style>` / `[data-no-vars]`.
- **Export.** Unchanged — only the existing 1/0 "Username" signal (`typedUsername`; relabelled "Username"). **No value column exists to leak, on any surface.**

## Consequences

- **Easier:** researchers can personalise the fake environment ("Signed in as *cooluser*", "Welcome back, *{username}*") with a participant-entered value, raising immersion for deception studies — with **zero credential/PII liability** because the value never leaves the participant's browser tab.
- **Harder / new commitments:** a client-only interpolation layer (DOM hydrator) is now a thing we maintain; it swaps tokens post-hydration, so there's a one-frame window where a raw `{username}` shows before it resolves, and a client component that re-renders its text is re-healed by the observer. The carry is same-tab only — a participant who reopens the study in a new tab loses the variable (acceptable: one run = one tab, per ADR-0095 am.).
- **Committed to:** never sending study-variable values to the server/DB/export; the `{name}` single-brace syntax; login inputs staying nameless.
- **Precluded (for now):** server-side interpolation; branch conditions reading variables; variables from sources other than the login (a text-answer producer, embedded-data promotion) — each is an additive follow-up on the same carry.

## Revisit triggers

- A variable must drive **branching / server logic** → it needs a server-side store (revisit Option A with an explicit purge + no-export policy).
- The **Toolbar/Nav block** (named consumer in ADR-0095/0098) ships → it reads this same carry for its avatar/handle.
- Researchers want **multiple named variables** or non-login producers → generalise the producer side (the carry already holds an arbitrary map).
- The one-frame hydration swap proves visible/annoying → move interpolation into the client stimulus components at the data level, or pre-resolve server-side.

## References

- ADR-0095 (persistent-notification `sessionStorage` carry — the pattern reused here; revisit trigger naming "study variables"), ADR-0096 (advance-via-Continue), ADR-0098 (login do-not-record — the guarantee this preserves; `captureUsername` amendment), ADR-0014 (no participant PII at rest — honoured by never persisting the value), ADR-0042 (`embedded-data` URL-param capture — the only prior participant-scoped store), ADR-0013 (anonymous participant runtime).
- Code: `05_app/lib/take/study-variables.ts` (carry + `interpolate`), `05_app/components/feature/take/study-variable-bar.tsx` (signed-in bar host), `05_app/components/feature/take/study-variable-hydrator.tsx` (token hydrator), `05_app/components/feature/take/login-view.tsx` (producer), `05_app/components/feature/builder/login-config.tsx` (Configure), `05_app/server/modules/registry.ts` (`login` config fields), `05_app/lib/export/dataset.ts` (1/0 "Username" column, unchanged shape).
- Wireframe: `03_design/wireframes/login-block.md`.
