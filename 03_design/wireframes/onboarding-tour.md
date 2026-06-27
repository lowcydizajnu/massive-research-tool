# Wireframe spec — First-run onboarding tour

- **Serves user flow:** [First-run orientation](../../02_product/user-flows/first-run-orientation.md)
- **IA placement:** [App shell — global affordances](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

> Consolidates the platform-foundation handoff's five `onboarding-tour-step-*` files into one spec — the steps are near-identical coachmarks; one doc is clearer than five. Built on `react-joyride` (ADR-0072).

## Purpose

> One sentence: what this screen exists to do.

A short, skippable coachmark tour that orients a brand-new researcher to the core surfaces on first load.

## Layout

> Layout zones.

- An overlay (dimmed scrim) with a single floating tooltip card per step, anchored to the step's target element (or centered for intro/outro). A spotlight highlights the target.
- Tooltip card: title, body, progress (e.g. "2 / 4"), Back / Next (Done on last), and a Skip affordance.

## Content inventory

> Every piece of content visible.

- **Step 1 — Welcome** (centered): "Welcome to Massive Research Lab" + "A quick 30-second tour… you can skip anytime." Static.
- **Step 2 — Destinations** (anchored to the left rail, `[data-tour="left-rail"]`): "Your destinations: Studies, Library, Activity, and more." Static.
- **Step 3 — Create a study** (anchored to the New study button, `[data-tour="new-study"]`): "Start a new study from scratch or from a framework." Static.
- **Step 4 — You're set** (centered): "Replay this tour anytime from Settings · Account." Static.
- **Controls** — Back / Next / Done, Skip, progress indicator. Computed (react-joyride).

## States

- **Default** — runs only for a researcher whose `hasSeenTour` metadata is unset, on `/studies` (where the targets exist).
- **Loading** — none (steps are static; the lib loads on demand).
- **Empty / Partial** — n/a.
- **Error** — if a target is missing the tour simply doesn't start; the metadata write is fire-and-forget (failure is harmless — at worst it runs once more).
- **Replay** — `?tour=replay` runs it again regardless of `hasSeenTour`.
- **Done/Skipped** — overlay removed; `hasSeenTour` set true.

## Interactions

- **Next / Back** — advance/retreat steps.
- **Done** (last step) / **Skip** (any step) — close the tour and call `markTourSeen()` (sets `hasSeenTour`).
- **Esc / scrim** — treated as skip.
- **Replay link** (Settings · Account) — navigates to `/studies?tour=replay`.

## Edge cases

- Non-`/studies` surface (e.g. personal `/home`) — the tour never starts (targets absent).
- Returning user — `hasSeenTour` true → never auto-runs.
- Reduced motion — disable the spotlight/scroll animation.
- Very small viewport — tooltip repositions (react-joyride handles); centered steps always fit.

## Accessibility notes

- Tooltip is a focus-trapped dialog; Next/Back/Skip keyboard-operable; Esc skips.
- Respect `prefers-reduced-motion` (no scroll-into-view animation; `disableScrolling`).
- Tour is purely additive — every target is independently reachable without it.

## Open questions

- Add a Templates step (handoff step 4) once `/library/templates` exists (Library-completion). Deferred.
