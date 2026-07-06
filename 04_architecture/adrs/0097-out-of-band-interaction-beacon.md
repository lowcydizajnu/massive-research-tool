# ADR 0097 — Out-of-band interaction beacon (cross-screen notification recording)

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Paweł Rosner
- **Tags:** blocks, runtime, take, recording, notification

## Context

The `notification` block can be set to `scope: "persist"` (ADR-0095 amendment): the banner rides across screens until the participant dismisses it. Recording, however, is anchored to the per-screen form-POST model — `recordScreenAnswers` only writes blocks that belong to the *resolved current screen*, and a response item is keyed by `(response_id, block_instance_id)`. So a persistent notice's answer is captured on its **anchor screen** (where the researcher placed the block) when the participant clicks Continue.

The owner ran the persist feature and asked for the missing piece: **"in Excel we should know when/where it was dismissed."** A participant who leaves the banner up on the anchor screen and dismisses it three screens later currently records `ignored` at the anchor — the later dismissal (and *which* screen it happened on) is lost, because that later screen's form has no field for a block that isn't on it.

Every recording path today runs through the linear form POST → server action → `recordScreenAnswers`. There is no way for a block to update its own answer from a screen it doesn't live on.

## Options considered

### Option A — Do nothing; document the limitation
- Persist records only the anchor-screen action.
- **Pros:** zero new surface.
- **Cons:** the owner explicitly needs late-dismissal data. Rejected.

### Option B — Re-inject the notification's fields into every later screen's form
- The persistent host writes hidden `action/atMs` inputs into whatever screen form is present.
- **Pros:** reuses the form path.
- **Cons:** `recordScreenAnswers` deliberately ignores instance ids not on the resolved screen (a security boundary — a crafted POST can't write arbitrary blocks). Re-injection is silently dropped, or forces us to weaken that boundary. Rejected.

### Option C — A dedicated, rate-limited out-of-band write endpoint (chosen)
- A small `POST /api/take/notification-action` beacon updates the SAME response item (upsert on `(response_id, block_instance_id)`), gated so it can only touch a **persistent notification** block that actually exists in the response's version snapshot.
- **Pros:** captures the real dismissal (action + screen + elapsed time) without weakening the form path; mirrors the existing anonymous participant endpoints (`take-upload`) for auth/rate-limit; reuses the block's own `responseSchema` for validation.
- **Cons:** a genuinely new write path outside the form POST — a new pattern that needs its own guardrails. Accepted with the constraints below.

## Decision

**We add a narrow out-of-band interaction beacon, used only by the persistent notification, that updates that block's existing response item with the action, the elapsed time since the notice first appeared, and the screen it happened on.**

- **Endpoint** — `POST /api/take/notification-action` (`app/api/take/notification-action/route.ts`). Anonymous like the rest of `/take/*`; body `{ responseId, blockInstanceId, action, atMs, screen }`. Rate-limited by `allowAnswer(responseId)` (the same 30/min per-response bucket as answers).
- **Server fn** — `recordNotificationAction` (in `server/runtime/participant.ts`). Guards, in order: response exists → block instance is present in the response's version snapshot AND is a `notification` with `scope: "persist"` → `action` is in the allowlist (`dismissed | ignored | cta:<n>`) → the assembled `{ action, atMs, screen }` passes the module's `responseSchema`. Only then does it **upsert** the response item, preserving `blockPosition` (the anchor) and touching only `answer` + `answeredAt`. Any failed guard is a silent no-op (`{ ok: false }`) — a forged beacon for a non-persist / non-notification block writes nothing.
- **Client** — the persistent host's `carried` `NotificationView` fires `navigator.sendBeacon` on a **later-screen** dismiss or CTA, carrying `atMs = now − firstShownAt` (first-appearance time is stamped into the sessionStorage carry so it survives navigations) and `screen = currentScreenIndex + 1`. The anchor screen still records through the form (its `screen` comes for free from the form's `questionIndex`); the beacon never fires there.
- **Schema + export** — `notification` and `modal` `responseSchema` gain an optional `screen` (1-based). The dataset export unpacks `{ action, atMs, screen }` into dedicated columns (action, time-to-action ms, action-screen), mirroring the social-post split.

## Consequences

- **Easier:** persist notifications now record *what / when / where*, and the exported data answers "when and where was it dismissed."
- **Harder / new commitments:** a second write path into `response_item` we must keep as tightly scoped as the form path — hence the persist-notification-only guard and the module-schema revalidation. Future overlay blocks (Modal variants, Toolbar) may reuse this endpoint, but each new consumer must be explicitly allowed server-side, never by default.
- **Known edge:** if the participant dismisses on a later screen and then navigates BACK to the anchor and clicks Continue again, the anchor form re-records `ignored`, overwriting the beacon's `dismissed`. Back-navigation re-answering is existing behaviour; this corner is accepted and noted rather than special-cased.
- **No migration / no seed:** `response_item.answer` is JSON; the optional `screen` is additive. Code-only.

## Revisit triggers

- A second block type needs out-of-band recording → generalise the endpoint's allowlist into a per-module capability flag instead of a hard-coded `notification/persist` check.
- Exact late-dismissal timing must survive back-navigation overwrite → make the anchor form skip re-recording once a terminal beacon action exists (needs a server read-before-write or a client tombstone).
- Volume/abuse concerns on the anonymous endpoint → tighten the rate-limit bucket or add a per-response action cap.

## References

- ADR-0095 (overlay/trigger UI-imitation blocks + the persist amendment this completes), ADR-0096 (Modal — a potential future consumer), ADR-0013/0014 (anonymous participant runtime + no-PII-at-rest boundary the endpoint honours), ADR-0016 (take-flow rate limiting reused here).
- Code: `05_app/app/api/take/notification-action/route.ts`, `05_app/server/runtime/participant.ts` (`recordNotificationAction`), `05_app/components/feature/take/notification-view.tsx` + `persistent-notifications.tsx` (the beacon client), `05_app/lib/take/notification-carry.ts` (first-shown timestamp), `05_app/lib/export/dataset.ts` + `05_app/server/trpc/routers/studies.ts` (export columns), `05_app/app/api/take-upload/route.ts` (the endpoint pattern mirrored).
