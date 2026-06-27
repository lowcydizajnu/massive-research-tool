# Wireframe spec — Feature-discovery tooltip

- **Serves user flow:** [First-run orientation](../../02_product/user-flows/first-run-orientation.md)
- **IA placement:** [App shell — shared components](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

> Shared design (platform-foundation PF3.3). One reusable `<FeatureTip>` for one-time discovery hints, capped at a small set (5–7) so it never becomes nagware.

## Purpose

> One sentence: what this screen exists to do.

Surface a single, dismissible hint the first time a researcher reaches a feature they haven't used, then never show it again.

## Layout

> Layout zones.

- An inline callout placed adjacent to the feature it describes (not a floating overlay): a soft `primary-subtle` bar with the hint text + a dismiss (×). Presence-based — it lives in the DOM only where that feature lives.

## Content inventory

> Every piece of content visible.

- **Hint text** — one sentence from the `FEATURE_TIPS` registry (`lib/feature-tips.ts`), keyed by a stable tip id. Static per id.
- **Dismiss control** — an × button (`aria-label="Dismiss tip"`).

## States

- **Shown** — the user is loaded, signed in, and the tip id is not in their `dismissedFeatureTips`.
- **Hidden/dismissed** — once dismissed (click or 8s auto), it never returns (persisted to Clerk publicMetadata, so it's cross-device).
- **Loading** — renders nothing until the user/metadata is loaded (no flash).

## Interactions

- **Click ×** — dismiss + persist (`dismissFeatureTip(id)`).
- **8-second timeout** — auto-dismiss + persist (same effect).
- (Handoff also lists "dismiss when the user interacts with the highlighted element" — deferred; click + timeout cover it.)

## Edge cases

- Signed out / metadata unread — renders nothing.
- Unknown tip id — the dismiss action no-ops (registry-validated).
- Read-only viewer — a tip is only mounted where the action it hints at is available (e.g. Invite tip only when the user can manage the team).
- Multiple tips on one surface — avoid; one hint at a time per surface.

## Accessibility notes

- `role="note"`; the × is a real focusable button with a label.
- Text-only (no reliance on color); contrast holds in both themes (tokens).
- Not a focus trap; purely additive — the feature is reachable without it.

## Applied tips (v1)

From `lib/feature-tips.ts` (capped): `connect-osf` (Account · Connections, when OSF not connected), `invite-teammate` (Team, when the viewer can manage members). `save-named-version` is registered for a later Builder-TopBar placement. More can be added cheaply by registering an id + mounting `<FeatureTip>` where the feature lives.

## Open questions

- Whether to add the "interacted with the element" dismissal trigger later (click + 8s suffice for v1).
