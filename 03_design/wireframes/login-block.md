# Wireframe spec — Login-screen block (Builder + take render)

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A stimulus block that shows a participant a realistic **login / sign-in screen** — brand, username + password fields, a sign-in button, and optional single-sign-on (SSO) buttons — for phishing-susceptibility, dark-pattern, and deception-in-context research. Implements ADR-0098, reusing the ADR-0095 trigger seam + the ADR-0096 advance-via-Continue mechanism. The research question is *behavioural* (would the participant enter credentials?), so **nothing the participant types is recorded** — only their action, its timing, and whether they typed into each field. Covers the Builder Configure panel + the participant take render.

## Layout

**Take render** — a centered login **card** filling the content column: an optional **brand** (logo + name), an optional **title** + **subtitle**, a **username** field, a **password** field, a primary **Sign in** button, an optional row of **SSO buttons** (e.g. Continue with Google / Facebook / Apple), and optional inert **"Forgot password?" / "Create account"** links. The screen's normal **Continue** stays available below as the ethical escape.

**Builder Configure panel** — a live-preview editor (like the notification / modal editors): Brand (preset or custom name + logo), Content (title, subtitle), Fields (username + password labels/placeholders, sign-in button label), Single sign-on (which providers), Extras (forgot / create-account links), Behaviour (trigger), plus the **"imitates a real product"** toggle (default on) with the deception attestation. A live preview renders the real login card inline.

## Content inventory

- **Brand** — preset (generic / a named service) or custom name + logo (R2 upload) — config.
- **Title / subtitle** — short copy above the fields — config.
- **Username field** — label + placeholder — config. **Value is never recorded.**
- **Password field** — label + placeholder — config. `type="password"`, `autocomplete="new-password"`. **Value is never recorded — no `name`, never submitted.**
- **Sign in button** — label — config; records `submit` and advances.
- **SSO buttons × 0–n** — provider set (google / facebook / apple / microsoft / x / generic) — config; each records `sso:<provider>` and advances.
- **Forgot / Create-account links** — optional, inert (or a `NavTarget` later) — config.
- **Deception attestation** (when `imitatesReal`) — static warning + attestation, folded into the freeze hard-gate.

## States

- **Default (Builder)** — generic brand, empty title, default field labels, one SSO off, `imitatesReal` on; "needs setup" until the attestation is checked.
- **Take — on-load / after / conditional** — the trigger seam (ADR-0095).
- **Typing** — the client marks `typedUsername` / `typedPassword` true as soon as a field is non-empty; the values themselves never leave the browser.
- **Sign in clicked** — records `submit` + `typed*` booleans, advances to the next screen.
- **SSO clicked** — records `sso:<provider>`, advances.
- **Ignored** — the participant uses the screen's Continue without logging in → `ignored` (+ any `typed*` booleans if they typed then backed out).

## Interactions

- **Sign in / SSO** — record the action, then click the real `[data-take-continue]` to advance (ADR-0096). Never read the field values.
- **Fields** — plain inputs with NO `name`; a client island only flips the `typed*` booleans. The password uses `type="password"` + `autocomplete="new-password"` so managers aren't invited to save.
- **Builder** — toggling `imitatesReal` reveals the attestation; brand preset swaps the logo/name in the preview; adding SSO providers adds buttons.

## Edge cases

- **Participant types a real password** — it stays in the browser input and is discarded on navigation; it is never in the form POST, the server, or the DB (do-not-record by construction, ADR-0098 / ADR-0014).
- **No SSO, no links** — a minimal username/password card; Sign in + Continue still work.
- **Very long brand/title** — truncate/wrap; the card stays centered and readable.
- **Screen with only the login block** — the login card fills the screen; Continue is the escape (like a bare-modal screen).

## Accessibility notes

- Real `<label>`s tied to each field; the Sign in button is a `<button type="button">` (it drives advance via JS, not a native submit of credentials).
- Focus order: username → password → Sign in → SSO → Continue.
- The password field is `type="password"` (masked); `aria`-labelled.
- Respect `prefers-reduced-motion` for any appear transition.

## Open questions

- Should the typed **username** ever be recordable (opt-in, encrypted)? Deferred to its own ADR — default is never (ADR-0098 Option C).
- Two-step (email → password) login fidelity? Deferred — v1 is a single card.
