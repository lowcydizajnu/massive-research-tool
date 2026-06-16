# Wireframe spec — Participants · Connections sub-view

- **Serves user flow:** [Run and read results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Connect (and disconnect) recruitment providers so the rest of the Participants destination can talk to them. The first sub-view a workspace lands on when it has no connection. Mirrors the OSF Connections surface (Settings · Connections, V1.5) — same encrypted-token pattern, same connect/reconnect/disconnect affordances — but scoped per-workspace-per-researcher rather than per-researcher-globally.

## Layout

Sub-nav strip (from the destination shell) with **Connections** active. Below it, one card per provider in a single column:

- **Prolific** card (V1.15.0; fully integrated)
- **CloudResearch** card (deferred; "Coming later" placeholder, disabled)
- **Sona Systems** card ("Coming in V1.17" placeholder, disabled)

## Content inventory

- **Provider card header** — provider logo + name + one-line description. Static.
- **Connection status** — "Not connected" / "Connected" green pill / "Reconnect needed" amber pill. Computed from `recruitment_provider_connection.status`.
- **Connected metadata** (when connected) — connected-at date, provider user identifier (opaque), last-sync timestamp. From server.
- **Connect control (Prolific)** — a **Personal Access Token** paste field + Connect button (PAT-first per ADR-0047; Prolific exposes PATs for third-party integrations). "Where do I find my token? → prolific.com" helper link. (An OAuth "Connect with Prolific" button is rendered only if/when Prolific OAuth is available; PAT is the shipped path.)
- **Disconnect / Reconnect** controls (when connected / errored).
- **Sona placeholder body** — "Polish university subject pools — credit-based recruitment for psychology students (UJ, UW, SWPS, AGH, …)", a disabled Connect button, and a "Tell us if you want this prioritized" feedback link (mailto for now). Pure visual signal; non-functional.
- **CloudResearch placeholder body** — "US-focused recruitment; coming after Prolific." Disabled.

## States

- **Default (none connected)** — Prolific card shows the PAT field + Connect; placeholders disabled.
- **Loading** — skeleton card rows while `recruitment.connections.list` resolves.
- **Empty** — same as default (no connections is the expected first state); copy nudges "Connect Prolific to recruit participants without copying URLs by hand."
- **Connected** — green pill + metadata + Disconnect.
- **Error / expired token** — amber "Reconnect needed" pill + the provider's last error message + a Reconnect (re-paste token) affordance.
- **Success / optimistic** — on connect, the card flips to Connected optimistically; a failed token validation rolls back with an inline error.

## Interactions

- **Connect (Prolific PAT)** — paste token → Connect → server validates the token against Prolific (a cheap `GET /users/me`-style call), encrypts (AES-256-GCM) + stores the `recruitment_provider_connection` row → card flips to Connected. Error path: invalid token → inline "That token didn't work — check you copied it fully."
- **Disconnect** — confirm → `recruitment.connections.disconnect` deletes the row (and best-effort revokes provider-side if supported) → card returns to Not connected.
- **Reconnect** — same as Connect, replacing the stored token.
- **Sona / CloudResearch disabled buttons** — no action; tooltip "Coming in V1.17" / "Coming later". The Sona feedback link opens a mail draft.
- **Viewer role** — all connect/disconnect/reconnect controls disabled with the read-only tooltip; cards still show connection status.

## Edge cases

- **Token pasted with whitespace** — trimmed before validation.
- **Provider down during validation** — distinguish "your token is invalid" from "Prolific is unreachable right now"; the latter offers Retry, not a token error.
- **Two researchers in one workspace each connect Prolific** — connections are per-researcher-per-workspace, so both rows coexist; the Open-recruitment + Compensation views attribute provider actions to the acting researcher's connection.
- **Long provider user identifier** — truncate with a title attribute.
- **Token revoked on Prolific's side after connecting** — next provider call 401s → background job flips status to "Reconnect needed"; the card reflects it on next load.

## Accessibility notes

- The PAT field is `type="password"` with a show/hide toggle; labeled; the helper link has descriptive text (not "click here").
- Status pills carry text, not color alone (icon + word). Disabled placeholder buttons use `aria-disabled` + a visible "Coming in V1.17" label, not just dimming.

## Open questions

- Whether Prolific exposes a usable OAuth flow at all — resolved at build time; ship PAT-first regardless (ADR-0047).
