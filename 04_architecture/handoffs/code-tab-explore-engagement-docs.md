# Code tab handoff — Explore + Engagement + Docs integration (drafted 2026-06-22 — owner brainstorm-locked)

> **Explore + Engagement + Docs = three connected growth-and-retention surfaces: an Explore destination that shows researchers what MRT actually does (use-case scenarios + public study showcase + starter-template chooser); engagement infra (weekly email digests + public researcher profiles + gentle return-nudges); and Mintlify-hosted documentation with in-app contextual ? icons that deep-link into the relevant doc page.** Estimated **~4 to 5 weeks Code-tab time** across 3 PR streams + ~2 weeks of owner content work (writing docs + curating Explore content). Pairs with the Library-completion handoff (Explore deep-links into starter templates) and Platform-foundation handoff (announcements ≠ docs; Explore ≠ FAQ).
>
> **Owner-locked defaults** (indie-solo MVP framing):
> 1. ✅ **Explore as a top-level destination** in LeftRail (visible to authenticated researchers); ALSO accessible as `myresearchlab.app/explore` publicly (for prospects). Two routes; same content; different chrome (public has marketing-site header; authed has app chrome).
> 2. ✅ **Public study showcase** reuses V1.8 Browse infra (existing `studies.browsePublic` + `studies.fork`) — no new data model required. Explore is a curated/featured surface on top of Browse.
> 3. ✅ **Public researcher profiles opt-in** (default OFF; explicit toggle in Settings · Account). Don't surprise researchers by making their workspace activity public.
> 4. ✅ **Weekly digest is opt-out** (default ON for new researchers; setting in Settings · Notifications). Indie-stage low-volume; opting researchers in by default maximizes the engagement signal.
> 5. ✅ **Mintlify** for hosted docs at `docs.myresearchlab.app` (~$20-50/month; saves weeks vs self-hosting). Owner-locked despite the cost — speed-to-ship matters more than $50/mo at indie scale.

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| `/browse` destination (V1.8) | Public-study browse + filter by tag/author/framework + fork-to-workspace + per-study public Details page. | `app/(app)/(workspace)/browse/` |
| `studies.browsePublic` (V1.8) | Cursor-paginated; tag/author filters; sort by recent/most-replicated. | `server/trpc/routers/studies.ts` |
| `studies.fork` (ADR-0018) | Existing cross-workspace fork mechanism reused for "Use this from Explore" affordances. | `server/trpc/routers/studies.ts` |
| Inngest email workers | The `email.digest` stub exists from V1.7 (ADR-0015); never been implemented. This handoff fills it in. | `server/workers/email-digest.ts` (stub) |
| `notification` + `activity_event` tables | Source data for weekly digest contents. | (V1.7) |
| `user.has_completed_onboarding` (Platform foundation) | Adjacent to engagement nudges (we don't nudge during onboarding). | (Platform foundation) |
| `release_announcement` widget (Platform foundation) | Separate from docs and Explore; this handoff doesn't change announcements. | (Platform foundation) |
| Library Templates (Library-completion) | Explore deep-links into `workspace_template` rows where `starter = TRUE`. | (Library-completion) |
| `?` icon affordances (none today) | This handoff introduces a consistent `<HelpLink docKey="..." />` component used across features. | (none) |
| Email transactional (Clerk magic-link) | Existing email delivery via Clerk's SMTP. Weekly digest uses a separate path — recommend Resend (~free tier) OR Vercel-included Resend integration. | (none for digest) |

## What's missing (the Explore + Engagement + Docs build)

- `/explore` destination (LeftRail + public route) with curated content surface
- Mintlify docs site at `docs.myresearchlab.app` + content (owner-track work)
- `<HelpLink />` component + per-feature doc-URL mapping
- `email.digest` worker fleshed out (per-researcher weekly summary)
- Resend (or alternative) ESP integration behind an `EmailAdapter`
- Public researcher profile page (`/u/<handle>` or `/researcher/<handle>`)
- `user.handle` + `user.public_profile_enabled` + profile visibility controls in Settings · Account
- Return-nudge worker (researcher hasn't logged in for N days + has unread notifications → email)
- "Pinned starter template" curation surface (admin sets featured templates for the Explore landing)

---

## Section EE1 — Explore destination (~1.5 weeks)

### Route + chrome

- Authed route: `/explore` under `(app)/(workspace)/explore/page.tsx` — appears in LeftRail
- Public route: `app/(app)/(public)/explore/page.tsx` — same content, marketing-site chrome (no LeftRail; signup CTA in header)
- Shared content components — both routes render the same `<ExploreContent />` island

### Landing content

Mix of curated + dynamic:

**Use-case scenarios** (curated by you; 5-8 entries to start):
- "Run a misinformation study" — short framing paragraph + "Use this starter template" button → forks the Misinformation Research Framework starter template
- "Replicate a published study" — framing + "Browse public studies" → `/browse`
- "Run a Prolific A/B test" — framing + "Use this starter template" (when one exists; placeholder if not)
- "Pilot a new measure with friends" — framing + "Build from scratch" → `/studies/new`
- ... etc

Each scenario card: title + 2-sentence body + cover image + primary CTA + secondary "Read more →" → docs page (when docs ship)

**Featured starter templates** (dynamic):
- Card grid: pulls from `workspace_template WHERE starter = TRUE AND share_scope = 'public' ORDER BY use_count DESC LIMIT 6`
- Each card: cover image + name + description + use_count + "Use this template" → fork

**Wall of community studies** (dynamic):
- 6-9 recent public studies, mixed sort (recent + most-replicated)
- Each card: title + author + tags + use_count + "Replicate" → fork
- "See more →" → `/browse`

**Showcase of community researchers** (dynamic, only if any opt-in profiles exist):
- Avatars + names of researchers with `public_profile_enabled = TRUE` who have at least 1 published study
- Click → `/u/<handle>` profile page

### "Pinned scenarios" admin curation

Use-case scenarios stored as Markdown files in `05_app/content/explore/scenarios/*.md`:
```yaml
---
slug: misinformation-study
title: Run a misinformation study
order: 1
cover_image_r2_key: ws/system/explore/misinformation.jpg
starter_template_id: <ulid>
secondary_cta_url: /docs/getting-started/misinformation
---
Body markdown here...
```

Owner edits these files directly (commits to repo). No admin UI for scenario CRUD in V1; it's a curation surface owned by you, not a researcher CMS.

### tRPC procedures

- `explore.featuredTemplates({ limit })` — public; returns starter+public templates
- `explore.communityStudies({ limit })` — public; returns recent public studies
- `explore.publicProfiles({ limit })` — public; returns opt-in researcher profiles

### Wireframe gates

- `03_design/wireframes/explore-destination.md`
- `03_design/wireframes/explore-use-case-card.md`
- `03_design/wireframes/explore-public-route-header.md` (marketing-site variant)

### Tests

- Unit: scenarios load correctly from Markdown
- Unit: featured templates query returns only starter+public
- e2e: visitor lands at `/explore` (public) → clicks "Use template" → redirected to signup → after signup → template auto-forked into new workspace
- e2e: authed researcher lands at `/explore` → "Use template" forks immediately into active workspace

---

## Section EE2 — Public researcher profiles (~1 week)

### `user` table additions

```sql
ALTER TABLE "user" ADD COLUMN handle TEXT UNIQUE;             -- nullable; researcher-chosen; lowercase alphanumeric + hyphens
ALTER TABLE "user" ADD COLUMN public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN public_bio TEXT;                -- nullable; researcher-authored; max 1000 chars
ALTER TABLE "user" ADD COLUMN public_avatar_r2_key TEXT;      -- nullable; researcher-uploaded; falls back to Clerk avatar
```

Existing V1.12 profile fields (`full_name`, `affiliation`, `orcid`, `research_areas`, `website_url`, `scholar_url`) get surfaced on the public profile too.

### Profile route

`/u/<handle>` public route (no auth required):

- Avatar + name + affiliation + ORCID + research areas + bio + website + scholar
- "Public studies" section — list of studies this researcher has published as `share_scope='public'`
- "Templates" section — list of public templates this researcher has authored
- "Following" / "Followers" counts (V1.7 follow infra)
- "+Follow" button (if viewer is authed and not the researcher themselves)

### Settings · Account → Public profile sub-section

- Toggle: "Make my profile public" (writes `public_profile_enabled`)
- Handle picker (with availability check; defaults to a normalized version of their email's local part)
- Bio textarea
- Avatar upload (separate from Clerk avatar — researcher might want a different public-facing image)
- Preview: "Your public profile" → opens `/u/<handle>` in a new tab

### tRPC procedures

- `users.publicProfile({ handle })` — `publicProcedure`; returns profile if `public_profile_enabled` AND handle matches
- `users.updatePublicProfile({ handle?, publicProfileEnabled?, publicBio?, publicAvatarR2Key? })` — `protectedProcedure`; handle uniqueness checked
- `users.checkHandleAvailable({ handle })` — `publicProcedure`; returns boolean

### Wireframe gates

- `03_design/wireframes/public-profile-page.md`
- `03_design/wireframes/settings-public-profile.md`

### Tests

- Unit: handle uniqueness enforced
- Unit: profile only returned if `public_profile_enabled`
- Unit: handle normalization rules (lowercase, hyphens only, no whitespace)
- e2e: enable profile → handle picker → save → public route loads → toggle off → public route 404s

---

## Section EE3 — Email digest + return nudges (~1.5 weeks)

### EE3.1 EmailAdapter + Resend integration (~3 days)

```ts
// server/adapters/email.ts
export interface EmailAdapter {
  send(opts: {
    to: string;
    from: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    tags?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

// server/adapters/email.resend.ts (the only @resend/* importer)
```

**Why Resend:** Resend is a developer-friendly ESP, $0 free tier covers 3k emails/month, $20 covers 50k — comfortable headroom at indie scale. Vercel-recommended.

Alternative: **Postmark** (more expensive but excellent deliverability) or **Brevo** (formerly Sendinblue; cheap; broader feature set).

Per ADR-0007 adapter discipline: only `email.resend.ts` imports `@resend/*`. Swap target = Postmark / Brevo / SES; lock-in inventory updated.

### EE3.2 Weekly digest worker (~3 days)

Inngest function: `email.weekly-digest` (cron-scheduled Sundays 09:00 UTC):

- For each researcher with `notification_preferences.weekly_digest_enabled = TRUE` (default TRUE):
- Compute their digest contents:
  - **Your week**: new notifications since last digest (comment activity, mentions, replications); new responses on your studies; OSF push results; AI-feature usage rolled up
  - **Community**: 2-3 new public studies from researchers they follow; 1-2 trending tags from their tagged-follow set
- Render HTML email template (React Email is the standard tool now — `react-email` from Vercel/Resend)
- Send via `EmailAdapter`
- Mark `user.last_digest_sent_at = NOW()` to avoid duplicate sends if cron retries

### EE3.3 `notification_preferences` table (~1 day)

```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  return_nudge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_for_mentions BOOLEAN NOT NULL DEFAULT TRUE,
  email_for_comment_replies BOOLEAN NOT NULL DEFAULT TRUE,
  email_for_replications BOOLEAN NOT NULL DEFAULT TRUE,
  -- Add more as features ship; per-event-type toggles preferred over a single "all email" toggle
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Settings · Notifications page exposes all toggles. New `user` rows auto-get a `notification_preferences` row with defaults.

### EE3.4 Return-nudge worker (~2 days)

Inngest function: `email.return-nudge` (cron-scheduled daily 14:00 UTC):

- For each researcher with `notification_preferences.return_nudge_enabled = TRUE`:
- Filter: `last_seen_at < NOW() - INTERVAL '14 days'` AND `last_seen_at > NOW() - INTERVAL '60 days'` (don't nudge dormant >60d users — that's a different cadence)
- Filter: has at least one unread notification (comment / mention / fork)
- Render HTML email: "You've got X unread notifications waiting"
- Send via `EmailAdapter`; mark `user.last_return_nudge_at = NOW()`; do NOT re-nudge within 14 days

### Wireframe gates

- `03_design/wireframes/email-weekly-digest.md` (email-template wireframe)
- `03_design/wireframes/email-return-nudge.md`
- `03_design/wireframes/settings-notifications.md`

### Tests

- Unit: digest computation correctly aggregates per-researcher data
- Unit: opt-out (`weekly_digest_enabled = FALSE`) skips the researcher
- Unit: idempotency — running the cron twice in one day doesn't duplicate sends (via `last_digest_sent_at`)
- Unit: return-nudge cadence respects 14-day cooldown
- e2e: create test researcher → fast-forward 14 days → trigger nudge worker → email lands at fixture inbox

---

## Section EE4 — Docs integration (Mintlify + `<HelpLink />`) (~1 week + ongoing content)

### EE4.1 Mintlify setup (~1 day)

- Owner signs up at https://mintlify.com (free tier first; upgrade to ~$20-50/mo when content scales)
- Create site at `docs.myresearchlab.app`
- DNS: add CNAME `docs` → `cname.mintlify.app` (Mintlify provides)
- Mintlify auto-handles SSL
- Initial site structure (`mint.json` config):
  ```
  Getting started
    - Quickstart
    - Signing up
    - Your first study
  Builder
    - Block catalogue (one page per module)
    - Conditions
    - Variants
    - Themes
  Integrations
    - OSF
    - Prolific
    - Anthropic Claude (BYO key)
    - Hume AI (BYO key — V2.1)
  Methodology
    - Preregistration walkthrough
    - Replication best practices
    - IRB checklist
  Reference
    - Data model
    - API (future)
  ```
- Style: match MRT's design language (warm parchment + Plex Serif) — Mintlify supports custom CSS

### EE4.2 `<HelpLink />` component + per-feature mapping (~2 days)

```tsx
// components/feature/help/help-link.tsx
export function HelpLink({ docKey, label }: { docKey: HelpDocKey; label?: string }) {
  return (
    <a
      href={`https://docs.myresearchlab.app${DOC_URLS[docKey]}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary"
      title={label ?? 'Learn more'}
    >
      <HelpCircleIcon className="w-4 h-4" />
      {label}
    </a>
  );
}

// lib/help/doc-urls.ts
export const DOC_URLS = {
  'builder.conditions': '/builder/conditions',
  'builder.variants': '/builder/variants',
  'builder.themes': '/builder/themes',
  'integrations.osf': '/integrations/osf',
  'integrations.prolific': '/integrations/prolific',
  'integrations.anthropic': '/integrations/anthropic',
  'integrations.hume': '/integrations/hume',
  'methodology.preregistration': '/methodology/preregistration',
  'methodology.replication': '/methodology/replication',
  'block.likert': '/builder/blocks/likert',
  'block.audio-record': '/builder/blocks/audio-record',
  // ... etc per block kind
} as const;

export type HelpDocKey = keyof typeof DOC_URLS;
```

Place `<HelpLink docKey="..." />` next to feature headings + Configure panels + integration cards.

If `DOC_URLS[docKey]` points to a not-yet-written page, Mintlify shows a placeholder ("Coming soon"). Track which docs are missing via an admin sub-page that scrapes `DOC_URLS` and checks which have content.

### EE4.3 Content writing (~ongoing, owner work)

Priority order:
1. Block catalogue (one page per module; 46+ modules; ~3 hours per module ≈ 6 weeks part-time)
2. Integrations (OSF / Prolific / Anthropic / Hume / Inngest-not-researcher-facing) — most important for researchers (~1 week part-time)
3. Methodology guides (preregistration / replication / IRB checklist) — owner can recycle existing 01_research/ insights (~3 days)
4. Quickstart + first-study tutorial — most-trafficked page; deserves polish (~3 days)

Owner-track work; not Code tab.

### Wireframe gates

- `03_design/wireframes/help-link-component.md`
- `03_design/wireframes/docs-site-style-guide.md` (a brief on Mintlify customization)

### Tests

- Unit: `<HelpLink />` renders correct URL per docKey
- Unit: typecheck enforces docKey is in the typed union
- Build-time: a CI script verifies that every `DOC_URLS` entry resolves to a real Mintlify page (HTTP 200) — surfaces missing docs

---

## ADRs needed

- **ADR-00XX — Explore destination as authed + public surface.** Locks: dual-route (authed `/explore` + public `/explore`); curated scenarios + dynamic featured templates + community studies; admin curates via Markdown files in repo (no scenario CMS); public route used for SEO + prospect signup.
- **ADR-00XX — Public researcher profiles (opt-in).** Locks: handle uniqueness; `public_profile_enabled` default FALSE; `/u/<handle>` route; ORCID-style profile content; reuses V1.7 follow infra.
- **ADR-00XX — Email digests + return nudges + EmailAdapter.** Locks: Resend as V1 ESP; weekly digest opt-out default; return-nudge cadence (14d cooldown; only 14-60d-dormant); `notification_preferences` schema.
- **ADR-00XX — Docs at docs.myresearchlab.app via Mintlify + `<HelpLink />` discipline.** Locks: Mintlify as docs host; typed `DOC_URLS` map; CI check for missing docs; content-writing as owner-track ongoing work.

4 ADRs.

---

## Wireframes needed

- 3 Explore wireframes (destination + use-case card + public-route header)
- 2 public-profile wireframes (page + settings)
- 3 email wireframes (digest + return-nudge + notifications settings)
- 2 docs wireframes (help-link component + Mintlify style guide)

10 wireframes.

---

## Sequencing PRs (~4.5 weeks total)

**Stream EE1 — Explore destination (~1.5 weeks):**
- PR EE1.1: `/explore` authed route + LeftRail entry + ExploreContent island scaffold (~2 days)
- PR EE1.2: Scenario Markdown loader + 5 starter scenarios + cover images (~2 days)
- PR EE1.3: Featured templates + community studies + public profiles queries + ExploreContent integration + `/explore` public route + marketing-site header (~3 days)

**Stream EE2 — Public profiles (~1 week):**
- PR EE2.1: User table migration + `users.publicProfile` / `updatePublicProfile` / `checkHandleAvailable` + Settings · Account UI (~3 days)
- PR EE2.2: `/u/<handle>` route + public studies + templates lists + follow integration (~2 days)

**Stream EE3 — Email infra + digests + nudges (~1.5 weeks):**
- PR EE3.1: `EmailAdapter` interface + Resend impl + lock-in inventory row (~2 days)
- PR EE3.2: `notification_preferences` schema + Settings · Notifications page (~1 day)
- PR EE3.3: Weekly digest worker + React Email template + e2e against Resend fixture (~3 days)
- PR EE3.4: Return-nudge worker + cooldown logic + ADR (~2 days)

**Stream EE4 — Docs integration (~1 week + ongoing content):**
- PR EE4.1: Mintlify setup + DNS + custom CSS + initial mint.json structure (owner-track, ~1 day)
- PR EE4.2: `<HelpLink />` component + `DOC_URLS` typed map + first 10 placements in existing features (~2 days)
- PR EE4.3: CI check for missing docs + admin sub-page surfacing missing-docs report (~2 days)
- Content writing — owner-track ongoing

---

## Open questions

1. **Explore route — visible to non-authed visitors?** Yes (per default) for SEO + signup conversion. Confirm or override.
2. **Public profile handle — auto-suggest from email or require explicit pick?** Recommend: auto-suggest from email local part; researcher can override; uniqueness checked on save.
3. **Weekly digest — opt-out default vs opt-in default?** Recommend opt-OUT (digest ON for new researchers; researcher disables in Settings). Default opt-OUT maximizes engagement signal at indie scale. Confirm.
4. **Resend vs Postmark vs Brevo?** Resend has best DX + free tier; recommend. Postmark = best deliverability but more expensive; Brevo = cheap but cluttered UI. Confirm or override.
5. **Mintlify free tier vs paid?** Free has Mintlify branding in footer + limited team seats; paid (~$20/mo Starter) removes branding + unlimited seats. Recommend: free tier for V1, upgrade when content scales. Confirm.
6. **Content writing pace — try for one block-page per week or all-at-once burst?** Recommend: one per week for routine; bursts when shipping new features (e.g., write Hume docs alongside V2.1 PRs). Owner-track decision.

6 open questions.

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/handoffs/code-tab-library-completion.md` — Templates `starter` flag this handoff references.
3. `04_architecture/handoffs/code-tab-platform-foundation.md` — distinct from announcements widget (announcements = in-app; digest = email).
4. `04_architecture/adrs/0007-path-a-vs-b.md` — adapter discipline for EmailAdapter.
5. `04_architecture/adrs/0015-notifications-comments-activity.md` — `notification` + `activity_event` tables; data source for weekly digest.
6. `04_architecture/adrs/0018-cross-workspace-forking.md` — `studies.fork` reused by Explore "Use template" affordance.
7. `05_app/scripts/seed-network-demo.ts` — for fixture researchers used in e2e tests.
8. https://resend.com/docs/api-reference — Resend API.
9. https://mintlify.com/docs — Mintlify configuration.
10. https://react.email/docs/introduction — React Email templates.

---

## What's NOT in this scope (deferred)

- **Annual research review email** ("your year in MRT" — Spotify-Wrapped-style). Defer; ship in December when researchers have a full year of data.
- **Streaks / gamification** (logged-in N weeks in a row). Don't do this — researchers aren't gym-app users; gamification backfires for serious research tools.
- **Discord / Slack community.** Defer until you have a critical mass of researchers asking for it (typically ~500 active researchers).
- **Email-to-feedback ingest** (researchers reply to digest with thoughts → lands in admin feedback queue). Defer; cool but not essential.
- **Social sharing of public studies** (Twitter/X cards, OpenGraph image generation). Defer; nice-to-have.
- **Sitemap.xml generation for SEO.** Worth adding once docs ship; ~half day Code tab; add as a follow-up PR.
- **Mintlify auto-publish from Markdown files in MRT repo.** Mintlify supports GitHub integration; defer setup until owner has a clear authoring workflow preference.
- **Email template localization.** English only for V1.
- **Per-workspace digest** (workspace-level summary vs per-researcher). Researchers want per-personal digest; workspace-level = V2.x.
- **A/B testing email subject lines.** PostHog (from Analytics + Admin handoff) supports feature flags; if you want to A/B email subjects, use PostHog flags; defer building the A/B framework itself.

When green: ping owner. Owner runs a smoke test (lands at `/explore` as visitor → clicks "Use template" → signup flow → template forked into new workspace; opens own profile in Settings → enables public profile → picks handle → visits `/u/<handle>` in new tab → confirms public visibility; waits 7 days OR triggers digest worker manually → confirms email arrives; visits `docs.myresearchlab.app` → confirms site loads + style is on-brand); signs the audit log; tags the release.
