# ADR 0072 — Platform foundation (safety baseline, feedback, onboarding, announcements)

- **Status:** accepted
- **Date:** 2026-06-26
- **Deciders:** project owner, Claude
- **Tags:** platform, observability, security, onboarding, growth

## Context

Before serious researcher adoption, an indie-solo SaaS needs table-stakes platform maturity that no feature handoff covers: error monitoring, dependency security, a public security posture, in-app feedback collection, first-time onboarding, empty-state copy everywhere, and a "what's new" surface. Captured in `04_architecture/handoffs/code-tab-platform-foundation.md` (owner brainstorm-locked). All of it is additive — no change to the participant runtime or the study/version model.

Two constraints carry over: **ADR-0014** (PII boundary — observability + feedback must never capture participant data or raw PII) and **ADR-0007** (adapter discipline — vendor SDKs sit behind a swap seam). The **legal-baseline** handoff's `cookie_consent` table is a *prerequisite* the consent-gated parts depend on; as of this ADR it is **not yet built** (only the handoff doc exists), so consent-gated features degrade gracefully until it lands.

## Options considered

- **A — Build the maturity layer ourselves with free/standard vendors (chosen).** Sentry + Dependabot + custom feedback/announcement widgets + react-joyride. Cheap, owns the data, no per-seat SaaS creep at indie scale.
- **B — Buy an all-in-one (Intercom / Pylon / Headway / LaunchNotes).** Faster to wire, but overkill + recurring cost for an indie-solo product; the custom widgets are small enough to own.
- **C — Defer platform maturity until adoption forces it.** Rejected: error blindness, dependency rot, no feedback channel, and dead empty states actively cost early adopters — these are the things that quietly kill SaaS before feature gaps do.

## Decision

Build the Platform-foundation handoff as four additive PR streams:

- **PF1 — Safety baseline.** **Sentry** (`@sentry/nextjs`) for error monitoring (free tier; `beforeSend` redacts auth headers / bearer tokens / `password=`; per ADR-0014 only `workspace_id`+`user_id` may attach, never participant data/PII). **Dependabot** (`.github/dependabot.yml`, weekly, grouped minor/patch). **`security.txt`** at `/.well-known/security.txt` (RFC 9116) + a public **`/security`** page describing the security posture.
- **PF2 — In-app feedback widget.** Floating button (authenticated shell only, never `/take/*`) → modal (text + kind + optional screenshot via `html2canvas` → R2 `ws/<ws>/feedback/<id>.png` + hashed context) → `feedback` table → minimal env-allowlisted `/admin/feedback`. Screenshot opt-in **respects `cookie_consent`** (once it exists; until then defaults ON with a note).
- **PF3 — Onboarding + empty states + feature discovery.** `react-joyride` first-run tour (`user.has_completed_onboarding`); a shared `<EmptyState>` applied across every destination; ≤7 one-time feature-discovery tooltips (`user.dismissed_feature_tips`).
- **PF4 — Announcement widget.** TopBar "what's new" + slide-out, `release_announcement` table + per-user `last_seen_announcement_at`.

**Vendor choices locked:** Sentry (error monitoring), Dependabot (deps), `html2canvas` (screenshot — see am. 2026-06-27), `react-joyride` (tour) — all free/MIT. Custom-built feedback + announcement widgets (no Intercom/Headway — overkill at indie scale).

> **Amendment 2026-06-27 — screenshot lib `html2canvas` → `html2canvas-pro`.** PF2 shipped with `html2canvas` 1.4.1, but capture silently failed in production: the app's Tailwind v4 palette emits `oklch()` colors, which `html2canvas` 1.4.1 cannot parse (it throws while cloning computed styles). Swapped to **`html2canvas-pro`** (2.x, MIT) — a maintained drop-in fork with `oklch`/`lab`/`lch`/`color-mix` support; same default-export API (`import html2canvas from "html2canvas-pro"`). The capture remains best-effort and never blocks the text submission (the widget now also tells the user when the image didn't attach). No data-model or interface change.

**Sentry adapter exception (to ADR-0007):** Sentry's Next.js SDK auto-instruments many code paths via its build plugin; full isolation behind an adapter defeats auto-capture. Sentry is therefore a **deliberate, recorded exception** (like the Clerk middleware exception) — swap target documented (PostHog error tracking / Datadog) and deferred until cost or scale forces it.

The `/admin/feedback` + `/admin/announcements` pages ship here as env-allowlist (`ADMIN_USER_IDS`) stubs; the **Analytics + Admin** handoff (ADR forthcoming) promotes them into a real `/admin` destination behind `user.is_admin`.

## Consequences

- **Easier:** real error visibility + alerting; automated dep updates + a credible security posture; a feedback channel; a first-run experience; fewer dead empty states; a release-notes channel.
- **Harder / committed:** one recorded adapter exception (Sentry); a small set of new tables (`feedback`, `release_announcement`) + user columns; consent-gated features must check `cookie_consent` once it exists (degrade gracefully until then).
- **Precluded (deferred):** PostHog analytics, the real Admin destination, session replay, status page, SOC2/pen-test — all out of scope (separate handoffs).

## Revisit triggers

- Sentry free-tier limits hit → adapter-ize or switch (documented swap targets).
- Feedback volume justifies a real support tool (Intercom/Pylon) → revisit the custom widget.
- legal-baseline `cookie_consent` lands → wire the screenshot opt-in + analytics opt-out to it.

## References

- `04_architecture/handoffs/code-tab-platform-foundation.md` (source); `04_architecture/handoffs/code-tab-legal-baseline.md` (cookie_consent prerequisite — not yet built); ADR-0014 (PII boundary), ADR-0007 (adapter discipline), ADR-0015 (markdown allowlist for announcement bodies).
- PF1: `.github/dependabot.yml`, `app/.well-known/security.txt/route.ts`, `app/security/page.tsx`; Sentry config (PF1.1, next PR).
