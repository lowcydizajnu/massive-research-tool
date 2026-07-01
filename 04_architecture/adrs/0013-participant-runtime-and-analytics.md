# ADR 0013 — Participant runtime architecture + third-party analytics

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** participant-runtime, analytics, privacy, performance, v1.5

## Context

V1.5 closes the wedge story (Hanna preregisters → runs → sees results). That requires building the participant runtime — the surfaces a real anonymous participant interacts with when taking a published study.

Two architectural questions have to be answered before any participant-facing code lands:

1. **Is the participant runtime a SPA (client-side router) or MPA (server-rendered, per-question page loads)?** This wasn't a question for the researcher-facing app (it's SPA-like via Next.js App Router client transitions, and that's fine — nobody runs Clarity on their own admin dashboard). For the participant runtime, it determines whether researchers can use Microsoft Clarity, Hotjar, FullStory, PostHog and similar tools to analyze participant behavior. Project owner explicitly surfaced this 2026-05-29: "SPA pages don't work well with Clarity and heatmaps."

2. **What's the session model for an anonymous participant?** Participants are not authenticated through Clerk. They arrive via a recruitment URL Hanna shares (manually copied to Prolific etc. in V1.5; provider-integration is V1.6). The runtime needs to identify which participant is which response, handle resume after browser refresh, decide partial-response semantics, and never blur the line between participant identity and researcher identity.

Also implicit in the V1.5 plan: **Preview mode**. Hanna needs to walk through her study as a participant would before sharing the recruitment URL. The Preview stage was specified in IA v0.3 but never wireframed. It has to exist by V1.5 because the build → preview → preregister → run flow is the canonical Hanna loop. It would be wasteful to design Preview as a separate surface if it can ride on the participant runtime with one flag.

This ADR was foreshadowed as the "ADR-0012 candidate" in `00_meta/STATUS.md` suggested-next-moves on 2026-05-29; renumbered to ADR-0013 because the MVP build session landed an unrelated ADR-0012 (block format + autosave semantics) first.

## Options considered

### Option A — Client-side router (SPA) for the participant runtime

A single root route `/take/[studyId]` that hydrates a client-side React app holding the participant state. Question-to-question navigation is `router.push()` with shallow URL updates; the DOM mutates in place.

- **Pros:** fastest perceived transitions; easy to share state across questions in memory; natural place for live progress indicators.
- **Cons:** heatmap aggregation is genuinely worse on SPAs because element positions and selectors shift across re-renders; Clarity / Hotjar / FullStory all *technically* support SPAs via History API hooks but their session-recording fidelity drops; researchers comparing participant behavior on Question 3 across 200 sessions want a clean "this is Question 3" anchor that SPA tools struggle to provide; session-recording payload size grows because the entire DOM tree is being recorded across mutations; native browser back/forward becomes unreliable without manual handling.

### Option B — Server-rendered multi-page navigation, one question per route (chosen)

Each question is its own route — `/take/[studyId]/[sessionId]/[questionIndex]` — server-rendered as a full HTML page. Navigation between questions is real page loads (form POST advances the response; server redirects to the next question's URL). No client-side router for participant routes. React Server Components serve the question shell; specific module instances may hydrate to client components only when they need interactivity (e.g., a video stimulus with playback controls).

- **Pros:** Clarity / Hotjar / FullStory / PostHog all work exactly as designed — distinct URL per question, clean per-question heatmaps, lower session-recording payload (each page is a fresh load, not a long mutation stream); native browser back/forward works without code; mirrors the convention Qualtrics + SurveyMonkey + Typeform use for participant flow (no accident); easier to inject third-party tracking only on `/take/*` routes since they're a distinct route segment; better Lighthouse / Core Web Vitals scores per page (smaller initial JS bundle, RSC handles the static shell).
- **Cons:** slightly slower per-question transition (full page load vs. SPA hop); state between questions has to round-trip through the URL or a server-side session record (server-side is the right answer anyway for partial-response durability); requires a form-POST → server-redirect pattern for advancing, not a click-handler.

### Option C — Hybrid (SPA shell, server pre-renders the next question)

Client-side router with aggressive server prefetching of the next question's content. Best-of-both intent.

- **Pros:** smoother transitions than B; better analytics than A.
- **Cons:** still fundamentally a SPA from Clarity's perspective (no real page load = no clean per-question anchor); complexity cost is real; we'd need custom integration code for every analytics provider; the architectural cliff between "researcher tool is SPA-ish" and "participant runtime is MPA" is honest and well-understood. Hybrid muddies that distinction.

### Option D — Separate Next.js zone for the participant runtime

A second Next.js deploy (multi-zone pattern) hosted at `take.<workspace>.research.tool` while the researcher app stays at `app.<workspace>.research.tool`.

- **Pros:** maximum isolation — participant runtime can't accidentally pull researcher-app dependencies; could be deployed on edge functions for lower latency.
- **Cons:** doubled deploy surface, doubled config, doubled monitoring; no real benefit in V1.5 since both surfaces share the data layer; multi-zone is a real Next.js feature but a real complexity hit. Reserve for later if scale demands.

## Decision

**We will use Option B — server-rendered multi-page navigation, one question per route, for the entire participant runtime.**

Concretely:

- Route shape: `/take/[studyId]/[sessionId]/[questionIndex]` for the answering surface; `/take/[studyId]/[sessionId]/complete` for the terminal page.
- Per-question rendering: React Server Component renders the question shell, the active block's module instance, and the form. Client Components are scoped to specific module needs (video playback controls, drag-and-drop interactions) — never the chrome.
- Advancing a question: form POST → server action → response storage → server-side redirect to next question. Browser sees real page transitions.
- Session identity: see ADR-0014 (response data model) for the anonymous-participant identifier strategy.
- Preview mode: same routes, with a `?preview=true` query parameter. Server reads this once at session creation, marks the session row as `mode: preview`. All response storage is bypassed; participant runtime is otherwise identical so Hanna sees exactly what real participants will see.
- Third-party tracking injection point: a researcher-level setting (UI in V1.6) holds optional Clarity / Hotjar / PostHog tracking IDs. The script is server-injected *only* on `/take/*` routes — never on the researcher dashboard, never on `(auth)/*` pages. V1.5 ships the route-level injection mechanism with an empty config (so the surface is ready); the settings UI to populate it is a V1.6 add.
- GDPR consent: V1.5 ships a minimal consent surface at `/take/[studyId]/start` shown before the first question, defaulting to "no third-party tracking" if the researcher has configured any. The full GDPR data-rights flow (download my data, delete my data) is V1.6.

The reasoning in one sentence: participant analytics is a real researcher need that determines whether they choose this tool over Qualtrics; making the runtime SPA-shaped to save a few hundred milliseconds per transition would forfeit that capability for no proportional gain.

## Consequences

**What becomes easier:**
- Researchers can paste a Clarity / Hotjar / FullStory / PostHog tracking ID and get clean per-question heatmaps without engineering effort on our side.
- Lighthouse / Core Web Vitals are good per page (small bundle, fast render); important because some recruitment platforms penalize slow studies in matching algorithms.
- The Preview surface is essentially free — same code path with a flag.
- Browser back/forward works without custom code (matters more than expected; participants sometimes go back to re-read a stimulus, especially in misinformation studies).
- Server-side form POST → response storage gives us partial-response durability for free; if a participant's browser crashes mid-study, what they've answered is already persisted.

**What becomes harder:**
- Per-question transitions are slightly slower than SPA hops; we mitigate with aggressive RSC streaming and minimal client JS. Acceptable trade-off for a single-digit-questions study; questionable for 200-question studies (defer worry to V1.6 if real).
- State sharing between questions requires server-side session storage; we can't keep "temporary state" in client memory. This is mostly a discipline forcing function and not a real constraint.
- The participant-facing UI cannot reuse researcher-facing chrome components without adaptation (researcher chrome assumes auth + tRPC + client router; participant runtime has none of those). Plan the component split deliberately rather than hope for accidental reuse.

**What we are now committed to:**
- The `/take/[studyId]/[sessionId]/[questionIndex]` route shape and the multi-page navigation pattern.
- A server-side session record per participant attempt (anonymous identifier, mode flag, condition assignment per ADR-0014, position pointer, started_at, completed_at).
- A consent screen before the first question if any third-party tracking is configured by the researcher.
- A route-level mechanism for injecting third-party tracking scripts (empty config in V1.5; settings UI in V1.6).
- A `?preview=true` query parameter handled at session creation, never trusted from the URL on subsequent requests (the session row's `mode` is the source of truth).

**What we are now precluded from:**
- Building the participant runtime as a SPA later without breaking analytics for every researcher who has come to depend on the multi-page pattern.
- Injecting third-party tracking on researcher-facing routes. The dashboard is never tracked by third parties without an explicit, separate decision (which would itself need an ADR).
- Treating Preview as a separate surface with its own code path. The flag-and-reuse pattern is mandatory; divergent Preview code drifts and becomes a separate maintenance burden.
- Sharing participant-side state via React Context across question navigation (it would re-mount per page); state must travel via the URL or the session record.

## Amendment 2026-06-03 (V1.6 PR-1c) — preregistration is not required to run

V1.5 gated recruitment on a `kind:preregistered` version, which forced the OSF open-science path on *every* run — wrong for pilots / exploratory studies that don't want an OSF preregistration. This amendment separates the two concerns the runtime had fused:

- **Running still requires an *immutable, frozen* version** — the participant runtime never serves the mutable autosave tip (so a design can't change mid-collection and the dataset always maps to one design). That invariant is unchanged.
- **That frozen version no longer has to be a preregistration.** A study can be **published** — frozen into an immutable `kind:published` version with **no OSF push** — and run from that. Preregistration (`kind:preregistered`, with the OSF push) remains the confirmatory / open-science path.

Concretely: the **runnable version** is the latest version whose `kind ∈ {preregistered, published}`. `studies.openRecruitment`, `studies.getRunInfo`, `studies.getResults`, and the participant `resolveOpenRecruitment` all resolve the latest *runnable* version (not preregistered-only). A new `studies.publish` mutation freezes the autosave tip into a `published` version (copying conditions, same as preregister) without enqueuing an OSF push. The Build/Run surface offers both paths: **Preregister** (open-science) and **Publish & run** (no OSF). `studies.getPreregistration` stays preregistered-only (it backs the Preregister-stage receipt). No schema change — `published` is an existing `experiment_version_kind` (ADR-0002).

## Revisit triggers

- A researcher requires a SPA-style experience for a high-fidelity stimulus (e.g., a continuous-tracking task where each question transition would break the data). Likely a separate "live experiment" sub-runtime with its own ADR rather than reopening this one.
- We add support for very-long studies (>50 questions) where per-question transition latency becomes a measurable abandonment driver. Consider RSC streaming optimization or selective hydration rather than reverting to SPA.
- Third-party analytics providers offer a universally-better SPA integration (none currently do).
- We need to host participant runtime separately for compliance / data-sovereignty reasons. Multi-zone (Option D) becomes the answer at that point.
- Real user research with researchers shows that Clarity / heatmap integration isn't actually used or valued — would weaken the case for the per-question routing complexity. Validate when V1.5 ships.

## References

- ADR-0011 — scaffold strategy; V1.5 is the next milestone after MVP.
- ADR-0014 — response data model + conditioning; defines the session and response storage this runtime writes to.
- ADR-0005 — OSF integration; the preregistered version this runtime serves.
- ADR-0007 — Path A vs B; Inngest (BackgroundJobAdapter) gets its first use when the OSF push job fires from the Preregister stage (separate from this ADR but adjacent in V1.5).
- ADR-0001 — modular composition; the question/block being rendered is a ModuleInstance per the schema.
- `02_product/user-flows/hanna-build-a-study.md` — the upstream flow this runtime serves.
- `03_design/wireframes/build-stage-builder-mode.md` — the surface a researcher uses to design what this runtime renders.
- `00_meta/STATUS.md` — surfaced 2026-05-29 as ADR-0012 candidate (renumbered to 0013 after MVP-time ADR-0012 took the slot).
- Microsoft Clarity SPA support docs: <https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-spa>
- Hotjar SPA support docs: <https://help.hotjar.com/hc/en-us/articles/115011805428>
- Qualtrics + SurveyMonkey use the same multi-page pattern; this is convention, not novelty.
