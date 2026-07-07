# ADR 0095 — Overlay/trigger UI-imitation blocks + navigation targets

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Paweł Rosner
- **Tags:** blocks, runtime, take, stimulus, deception, navigation

## Context

The project owner wants a family of **UI-imitation stimulus blocks** — Notification, Modal, Login screen, Toolbar/Nav — so researchers can build studies inside a *simulated app environment* (dark-patterns, deception-in-context, misinformation UX). These sit alongside the existing `social-post` block, which already imitates real platform chrome.

Today every block renders **inline** in the linear screen flow (`deriveScreens` → one screen per group/single; Continue submits and advances). Three capabilities these blocks need do not exist:

1. **A floating/overlay presentation** — a notification pinned to the top of the viewport, a modal centered over a backdrop, a sticky toolbar — rather than an inline card.
2. **Triggers other than "it's this screen's turn"** — show *on screen load*, *after N seconds*, or *conditionally*. We have `showIf` (server + client `RevealGate`, ADR-0021/0088) and `maxTimeSec` (ADR-0087), but no on-mount/after-delay overlay trigger.
3. **Navigation targets for CTAs** — the only "go somewhere" today is `end-redirect` (ADR-0042): terminal, one URL, manual. A notification/modal CTA wants to open an external link, send the participant to *another study*, or jump to *a part of the same study*.

Per the owner's directions this session: **build Notification first**, lay only the **minimum shared** infrastructure it needs (extend when later blocks require more), and route deception-bearing variants through the **same IRB-attestation + preset-warning gate** as `social-post` (ADR-0024/0084/0085). This ADR is deliberately scoped to that first slice; the study-variables layer, the "do-not-record" field-privacy model, and intra-study screen-jump are named here but decided in their own ADRs when Login/Toolbar/Modal land.

## Options considered

### Option A — Model overlays as ordinary inline blocks with CSS positioning
- A `notification` block renders inline but uses `position: fixed`.
- **Pros:** no runtime changes; reuses the block-view dispatch as-is.
- **Cons:** an inline block that's actually a fixed overlay fights the screen's layout/scroll; no clean "trigger" hook; the Continue/submit model doesn't know an overlay is pending. Fragile.

### Option B — A generic "overlay layer" in the take runtime that any block can opt into (chosen, minimal)
- Add a small, block-agnostic notion of **placement** (`inline` | `fixed-top`) and **trigger** (`on-load` | `after-delay` | `conditional`) that the runtime honors, plus a typed **navigation target** used by CTAs. Notification is the first consumer; Modal/Toolbar extend the same seam.
- **Pros:** one clean primitive the whole family reuses; keeps the linear submit model intact (an overlay is still a block on the current screen — it just renders floating and can appear after a delay); conditional trigger reuses the existing `showIf`/`RevealGate`.
- **Cons:** a genuinely new runtime concept (overlay portal + delay timer) — but small and additive.

### Option C — Build the full four-primitive foundation now (variables + do-not-record + nav + overlay)
- Design everything the four blocks will ever need up front.
- **Pros:** cleanest end state.
- **Cons:** over-builds before the later blocks reveal real requirements; slows the first block. Owner explicitly chose "minimum shared, grow as needed." Rejected for now.

### Navigation-target scope
- **`url`** (open in a new tab, `rel="noopener"`) and **`study`** (deep-link to the target study's `/take/<id>/start`, carrying panel params) are both just *links out* — safe and easy.
- **`screen`** (jump to a part of the *same* study mid-flow) is **deferred**: screens are routed by numeric index and the submit/branch model assumes linear progression, so an intra-study jump needs its own semantics (does it return? does it count? what about answers in between?). We'll design it with the Modal ("advance vs. stay"), where intra-study navigation is the natural focus.

## Decision

**We will add a minimal, block-agnostic overlay/trigger seam to the take runtime and a typed navigation-target, and ship the `notification` block as its first consumer — routing its deception-bearing variants through the existing IRB-attestation/warning gate.**

Concretely, scoped to the Notification MVP:

- **Placement** — a block may declare `placement: "inline" | "fixed-top"`. `fixed-top` renders through an overlay container pinned to the top of the take viewport, above the screen content, without disturbing the screen's flow or the Continue model.
- **Trigger** — `trigger: "on-load" | { after: seconds } | "conditional"`. `on-load` shows immediately; `after` shows on a client timer; `conditional` reuses `showIf` (server visibility + same-screen `RevealGate`). No new condition engine.
- **Navigation target** — a typed `NavTarget = { kind: "url", url } | { kind: "study", studyId }`, resolved by a pure `lib` helper into an `href` + `newTab` flag. `url` opens a new tab; `study` deep-links to `/take/<studyId>/start`. (`screen` deferred.)
- **The `notification` block** — variant (`error|warning|info|success|custom`), title + body, an optional left **thumbnail** (circular/square) for `custom`, **0–2 CTAs** each with a `NavTarget`, a **dismiss (X)** when `dismissable`, and the placement/trigger above. It **records an interaction answer** (`{ action: "dismissed" | "cta:<index>" | "ignored", atMs? }`, `collectsResponse: true`) so researchers can analyse engagement, but it never blocks Continue.
- **Deception gate** — the `custom` variant (and any that imitate a real system chrome) carry a preset-style **deception warning** and are covered by the **IRB-attestation hard-gate** before preregister/publish, mirroring `social-post` (ADR-0084/0085). A neutral `info/success` notice that doesn't impersonate a real product is exempt.

## Consequences

- **Easier:** the whole imitation-block family (Modal, Toolbar next) reuses one overlay/trigger/nav seam; researchers get in-context notifications with real CTAs and engagement data.
- **Harder / new commitments:** a new overlay portal + delay-timer in the take runtime; a typed nav-target we must keep honest as it grows; the deception gate now spans more than social-post.
- **Committed to:** overlays stay *blocks on the current screen* (linear submit preserved); CTAs link out only (`url`/`study`) until intra-study nav is designed; deception variants are attestation-gated.
- **Precluded (for now):** intra-study screen-jump; cross-block "study variables"; the "do-not-record" field model — each is a later ADR (Modal/Toolbar/Login).

## Amendment — 2026-07-06 (slim banner + cross-screen persistence)

Live testing surfaced two gaps in the first `fixed-top` render, and the owner set the direction (behavior "up to the researcher"; look "slim banner below the nav"):

- **Placement was wrong.** `fixed inset-x-0 top-0` *covered* the fake platform nav and used a heavy coloured left rail. A notification must sit **directly under** the nav, not over it.
- **Scope was implicit.** A block appears on exactly one screen, so a notice showed on only that screen — but researchers want to choose between a one-screen notice and one that follows the participant.

**Decisions:**

- **Slim banner under the nav.** `fixed-top` no longer uses viewport-fixed positioning. It renders a **slim, full-width, opaque bar portaled into the page-level `#take-topbar` slot** — the same slot the interaction gate (ADR-0087) already uses, which sits directly beneath the fake nav and above the content. Styling matches that bar (hairline bottom border, `--color-surface-canvas`, a small type-coloured icon) — no full-height coloured rail. The banner never overlaps the nav and content flows below it.
- **Researcher-chosen `scope`.** A new config field `scope: "screen" | "persist"` (default `"screen"`). `screen` shows the notice on its anchor screen only. `persist` keeps it visible across subsequent screens **until the participant dismisses it (or clicks a CTA)**. Because the take flow is a server-rendered MPA (each screen is a fresh render), persistence lives in **`sessionStorage`**, keyed by the response: the anchor block writes its config while shown, and a page-level `PersistentNotificationHost` re-renders it into `#take-topbar` on every later screen. Same-tab only, cleared on tab close — which matches one participant run. `persist` always renders as a banner.
- **Recording anchors, then updates out-of-band.** The engagement answer is recorded on the **anchor screen** (where the researcher placed the block) via the form, because `recordScreenAnswers` only writes blocks belonging to the resolved screen. The answer now carries a 1-based `screen` (free from the form's `questionIndex`) alongside `{action, atMs}`. For a `persist` notice dismissed on a *later* screen, the owner needed the real when/where in the export — so the deferred beacon was built as **ADR-0097**: a rate-limited `POST /api/take/notification-action` upserts that same response item with the later action + screen + elapsed time. The export splits `{action, atMs, screen}` into dedicated columns.

**Also corrected in the code since first draft:** the `screen` nav-target (intra-study jump) named as "deferred" above was in fact shipped with the Notification (`resolveScreenHref` in `lib/take/nav-target.ts`) and reused by the Modal (ADR-0096).

New code: `05_app/lib/take/notification-carry.ts` (sessionStorage carry + in-page live registry), `05_app/components/feature/take/persistent-notifications.tsx` (the host), amended `notification-view.tsx` (portal + `carried` mode + carry writes).

## Amendment — 2026-07-07 (a notification is chrome, not a screen — it folds onto the next screen)

The bare-overlay render-only pass (ADR-0096 am.) stripped the study card from a lone-notification screen, but the notification **still occupied its own screen** in the builder and the runtime — a banner with nothing beneath it, then a Continue. The owner rejected this twice, unambiguously: *"still is treated as a separate block on separate screen but it should be displayed along with first block after it in builder, or just with group when grouped."* A notification is chrome layered **over** content; it should never be a destination of its own.

**Decision — fold in `deriveScreens`, not in the renderer.** An earlier design pass had ruled out touching `deriveScreens` as "too invasive" because it feared desyncing the 1-based screen numbering that the CTA screen-picker and `resolveScreenHref` depend on. That fear is misplaced *when the fold happens inside `deriveScreens` itself*: every consumer — runtime (`resolveVisibleScreens`), preview, whiteboard, the CTA screen-picker (`builder-workspace.tsx`), and the flow graph — derives its screen list from that one function, so folding there renumbers **all of them identically**. A newly-picked `targetScreen` stores the folded number and the runtime resolves the folded number; they cannot disagree. Doing the fold in the renderer (the rejected render-only path) is what would have desynced builder vs runtime.

`foldNotifications(screens)` runs as the last step of `deriveScreens`:
- An **ungrouped lone-notification** screen is buffered and **prepended to the next content screen's block list** (so it banners over that screen's content). Consecutive notifications all fold onto the same next screen.
- **Login / modal own their screen** (full-screen takeover / overlay), so a buffered notification is **not** absorbed into them — it keeps its own screen in that adjacency (the numbering guard test locks this). This is the one case a notification still stands alone.
- A **trailing** notification (no content screen after it) attaches to the **last content screen**; a study of only notifications keeps them as their own screens (nothing to fold onto).
- A **grouped** notification is already a member of its group screen — untouched.

Because the notification now shares the next block's screen, its engagement answer records on that shared screen via the same per-screen form (`recordScreenAnswers` writes every block on the resolved screen, keyed by `block_instance_id`) — no recording change. `persist` carry and the out-of-band beacon (ADR-0097) are unaffected.

Changed code: `05_app/lib/whiteboard/screens.ts` (`foldNotifications` helper + call). Tests: `lib/whiteboard/__tests__/screens.test.ts` (fold / consecutive / trailing / login-modal-own-screen numbering guard). **Render-only, no migration, no seed.**

## Revisit triggers

- Modal/Toolbar need capabilities the minimal seam doesn't cover (multiple simultaneous overlays, stacking, focus-trap depth) → extend the overlay primitive.
- Intra-study screen-jump is required → its own ADR (nav semantics + branching/answers interaction).
- Reuse of a participant-entered value across blocks (username) → the "study variables" ADR.
- A no-store field is required (Login password) → the field-privacy ADR (ties to ADR-0014).

## References

- ADR-0024 (mimic presets + deception review), ADR-0084/0085 (branding tiers + IRB attestation gate — the machinery reused here), ADR-0021/0088 (`showIf` + `RevealGate`), ADR-0087 (interaction gate + `maxTimeSec`), ADR-0042 (`end-redirect` — the only prior "navigation").
- Code: `05_app/server/modules/registry.ts` (`MODULE_REGISTRY`, `CoreModuleDef`), `05_app/components/feature/take/block-view.tsx` (renderer dispatch), `05_app/lib/whiteboard/screens.ts` + `conditions.ts` (screens/`showIf`), `05_app/server/modules/branding-gate.ts` (attestation gate).
- Wireframe: `03_design/wireframes/notification-block.md`.
