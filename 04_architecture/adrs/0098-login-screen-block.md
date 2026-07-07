# ADR 0098 — Login-screen block + do-not-record field privacy

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Paweł Rosner
- **Tags:** blocks, runtime, take, stimulus, deception, privacy

## Context

Third of the UI-imitation stimulus family (after Notification ADR-0095 and Modal ADR-0096): a **fake login / sign-in screen** that imitates a real app's login (a generic service, or a branded one — "Sign in to continue"). Researchers use it for phishing-susceptibility, dark-pattern, and deception-in-context work: *would the participant enter credentials into this screen?*

The whole point is to observe the participant's **behaviour** at a credential prompt — not to capture credentials. That collides head-on with a hard constraint: **ADR-0014 (no participant PII at rest)**, and more sharply, a participant may type a **real password** into a convincing fake login. Storing that would be the single worst data-handling failure this product could have. The owner named this from the start: *"Login screen — do-not-record password privacy."*

Everything else the block needs — a trigger (on-load / after / conditional), advancing the flow on submit — already exists in the ADR-0095 seam and the ADR-0096 advance-via-Continue mechanism.

## Options considered

### Field recording
- **A — record username, never the password.** Half-measure: a username can itself be an email / real identifier (PII), and "record the login attempt" reads as "we captured what they typed." Rejected.
- **B — record NOTHING the participant types; only behavioural signals (chosen).** The credential inputs are never submitted (no `name`, so they never enter the form data / the server / the DB). What IS recorded: the **action** (`submit` / `sso:<provider>` / `ignored`), the **time to it**, and two **booleans** — did they type *something* into the username field, into the password field. That answers the research question (did they attempt to log in / enter credentials) with zero credential content and zero identifiers.
- **C — record values behind an opt-in "I have IRB approval to store credentials" toggle.** Deferred — no current need justifies building a path that can persist a real password; if a study ever needs the typed username (not password), that is its own ADR with an explicit, loud opt-in and encryption, and never the password.

### Rendering
- The login is a **page**, not a floating overlay, so it renders **inline** filling the content column (brand + fields + sign-in + optional SSO), reusing the trigger seam. (The Modal already covers the centered-overlay case.)

## Decision

**We add a `login` block that renders a realistic sign-in screen, records ONLY behavioural signals (never the typed username or password), and is deception-gated.**

- **Do-not-record field privacy (new pattern).** The username + password `<input>`s carry **no `name` attribute** — they are never part of the form POST, so their values never reach the server or the database (honouring ADR-0014 by construction, not by scrubbing). A small client island watches the inputs and writes only: `${np}action`, `${np}atMs`, `${np}typedUsername` (`"1"`/`"0"`), `${np}typedPassword` (`"1"`/`"0"`) into hidden fields. The password field additionally sets `autocomplete="new-password"` and the form is not a real credential form, so browser password managers aren't invited to save anything.
- **Recording.** `{ action: "submit" | "sso:<provider>" | "ignored", atMs, typedUsername: boolean, typedPassword: boolean }` (`collectsResponse: true`, `isAnswerEmpty` always false — exposure counts). Never the field contents.
- **Advance.** The Sign-in button and any SSO button record their action and then **advance the study** by clicking the screen's real `[data-take-continue]` (the ADR-0096 mechanism). The screen's own Continue stays available as the ethical escape (records `ignored`) so a participant who won't log in can proceed.
- **Content / config.** Brand (a preset name/logo, or custom), an optional title + subtitle, username + password field labels/placeholders, the sign-in button label, optional **SSO buttons** (a chosen set of providers), and optional "forgot password" / "create account" links (inert). Trigger reuses the seam.
- **Deception gate.** A credential prompt that imitates a real product is deception by definition. The block carries `imitatesReal` (default **true**) and, when true, requires `deceptionAck` — folded into the same freeze hard-gate (`assertBrandingGate`) as branded social-posts, custom notifications, and imitation modals. `isComplete` requires the attestation.
- **Export.** Dedicated columns — action, time-to-action, typed-username (bool), typed-password (bool) — mirroring the notification/modal split. No value columns exist to leak.

## Consequences

- **Easier:** researchers get a credible login prompt for phishing/deception studies with clean behavioural data and **no credential-storage liability**.
- **Harder / new commitments:** the "do-not-record field" pattern (unnamed inputs + client-only signals) is now a thing we maintain and must never regress — a future edit that adds a `name` to those inputs would silently start capturing passwords. A test asserts the recorded answer shape has no username/password value, as a regression guard.
- **Committed to:** never persisting typed credentials; deception attestation gating; advance-via-Continue.
- **Precluded (for now):** storing the typed username (Option C); a real auth handshake; multi-step login flows (email → password screens).

## Amendment — 2026-07-07 (captureUsername → study variable, runtime-only, never exported)

Revisit trigger #1 fired: the owner wants the typed **username** reused in-run — shown in a nav bar and dropped into message/block copy — *"only saved for experiment runtime but not exported... In export we can have column Username which values is 1 or 0."* This is **not** Option C (which anticipated server-side persistence + encryption at rest). The value is captured **client-side only** and never reaches the server/DB/export, so the do-not-record construction below is **preserved unchanged** — this amendment adds a display/immersion path, not a recording path.

**Decision** (see **ADR-0099 — study variables**, which owns the primitive):
- **`captureUsername` config (default ON) + `usernameVar` name (default `username`).** When on, the login's client island reads the username input value on submit and writes it to the client-only study-variable carry (`sessionStorage`, ADR-0099) **before** advancing. The username `<input>` still carries **no `name`** — the value never enters the form POST, the server, or the DB. The **password is never captured**, unconditionally.
- **`showSignedInBar` (default ON) + `signedInTemplate` (default "Signed in as {username}").** After the participant signs in, a slim signed-in bar renders into `#take-topbar` on later screens, and `{username}` resolves in any participant-facing copy (ADR-0099's hydrator).
- **Export unchanged.** The typed-username column stays a **1/0** signal (relabelled "Username"). No username *value* column exists anywhere — the recorded answer shape is untouched, and the "no credential value in the answer" regression test still holds.

Net: Option C (persisting the typed username server-side, with encryption) remains **precluded**. This amendment only carries the value in the participant's own browser tab for the duration of their run.

## Revisit triggers

- A study genuinely needs the typed **username** value *in the export / server logic* → still its own decision with a loud opt-in + encryption (never the password); ADR-0099 explicitly does **not** do this.
- The Toolbar/Nav block needs shared "study variables" (reuse a username across blocks) → **ADR-0099** (this block is the first producer).
- Multi-step / SSO-popup fidelity is required → extend the login renderer.

## References

- ADR-0095 (overlay/trigger seam + deception-gate reuse), ADR-0096 (advance-via-Continue), ADR-0084/0085 (`assertBrandingGate` IRB attestation reused), ADR-0014 (no participant PII at rest — the constraint this honours by construction), ADR-0013 (participant runtime).
- Code: `05_app/server/modules/registry.ts` (`login` def), `05_app/components/feature/take/login-view.tsx` (renderer), `05_app/components/feature/builder/login-config.tsx` (Configure), `05_app/components/feature/take/block-view.tsx` + `configure-form.tsx` (dispatch), `05_app/app/(take)/take/[studyId]/actions.ts` (`extractAnswer` login case), `05_app/server/modules/branding-gate.ts` + `server/trpc/routers/studies.ts` (`assertBrandingGate`), `05_app/lib/export/dataset.ts` + `studies.ts` (export columns).
- Wireframe: `03_design/wireframes/login-block.md`.
