# User flow — Public researcher profile — enable and view

- **Job-to-be-done:** [Get set up](../jobs-to-be-done/get-set-up.md)
- **Primary persona:** [Postdoc operator](../personas/postdoc-operator.md)
- **Secondary personas (if any):** [Principal investigator](../personas/principal-investigator.md) (reputation/visibility); any researcher discovering a peer via Browse/Explore
- **Grounding insights:** [Persona segmentation and strategic risks](../../01_research/insights/persona-segmentation-and-strategic-risks.md), [Finished studies and comparable discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md)
- **Status:** draft

## Goal

> One sentence: what the user is trying to accomplish.

Let a researcher choose to have a public profile page (`/u/<handle>`) that collects their published studies + templates so peers can find and follow their work — strictly opt-in, default off.

## Preconditions

> What must be true before the flow begins.

- **Enable side:** signed-in researcher in Settings · Account.
- **View side:** anyone (no auth) with the `/u/<handle>` URL, but only resolves if that researcher has `public_profile_enabled = true`.

## Postconditions

> What is true after the flow completes successfully.

- **Enable:** `public_profile_enabled = true`, a unique `handle` is reserved, and `/u/<handle>` resolves publicly (and the researcher appears in the Explore showcase band if they have ≥1 published study).
- **View:** the visitor sees the researcher's public identity + their public studies/templates; an authed viewer can Follow.

## Happy path

> Each step names the system response and the next decision point.

1. Researcher opens Settings · Account → "Public profile". (Trigger: wants to be discoverable.)
2. They toggle "Make my profile public" on. The system reveals the handle picker (prefilled with a normalized form of their email local part) + bio + avatar fields.
3. They accept or edit the handle; the system live-checks availability (`checkHandleAvailable`).
4. They save. The system validates handle uniqueness + normalization, persists the profile fields, and sets `public_profile_enabled = true`.
5. A "View your public profile" link opens `/u/<handle>` in a new tab — the same page any visitor sees.
6. (View side) a visitor opens `/u/<handle>` → the system renders the profile (identity + public studies + public templates + follow counts); an authed non-self viewer sees a **+Follow** button (reuses V1.7 follow infra).

## Branches and decision points

> For each non-trivial branch.

- **Decision:** handle is taken / invalid.
  - **Path A (free + valid):** save succeeds.
  - **Path B (taken or malformed):** inline error; save blocked until resolved; suggest the normalized/append-suffix variant.
- **Decision:** viewer identity on `/u/<handle>`.
  - **Anonymous:** read-only profile + a sign-up CTA to follow.
  - **Authed, not self:** +Follow / Following toggle.
  - **Authed, self:** an "Edit profile" link back to Settings (no Follow of yourself).
- **Decision:** profile later toggled off.
  - `public_profile_enabled = false` → `/u/<handle>` returns 404 (must not reveal it ever existed); the handle stays reserved to the user.

## Failure modes

> For each plausible failure.

- **Trigger:** visiting `/u/<handle>` for a non-existent or disabled profile. **System response:** 404 (not "disabled" — don't leak existence). **Recovery:** nothing to recover; it simply doesn't exist publicly.
- **Trigger:** avatar upload fails. **System response:** keep the prior avatar (or the Clerk fallback); non-blocking error on the field. **Recovery:** retry; the profile still saves without a new avatar.
- **Trigger:** handle collision on concurrent save. **System response:** unique constraint rejects; surface the inline "taken" error. **Recovery:** pick another handle.

## Out of scope

> What this flow deliberately does not cover, and which other flow does.

- The Explore showcase band rendering (EE1 / [explore-discovery](./explore-discovery.md)) — this flow only makes profiles exist; Explore surfaces them.
- Following mechanics themselves (V1.7 follows) — reused, not redefined here.
- Workspace-level public pages — profiles are per-researcher, not per-workspace.
- Email notifications about new followers — EE3.

## Open questions

> Anything we are unsure about.

- Whether to also expose `affiliation` / `orcid` / `research_areas` (existing V1.12 profile fields) on the public page by default, or behind per-field toggles. — owner (default: show the existing fields; one master opt-in, not per-field, for V1).
- Reserved/blocked handles (e.g. `admin`, `settings`, `u`) — maintain a denylist. — resolved in ADR-0077.

## Diagram

```mermaid
flowchart TD
  A[Settings · Account → Public profile] --> B[Toggle on]
  B --> C[Handle picker + bio + avatar]
  C --> D{Handle free + valid?}
  D -->|No| C
  D -->|Yes| E[Save → public_profile_enabled = true]
  E --> F[/u/handle resolves publicly]
  F --> G{Viewer}
  G -->|Anonymous| H[Read-only + sign-up CTA]
  G -->|Authed, not self| I[+Follow]
  G -->|Self| J[Edit profile → Settings]
```
