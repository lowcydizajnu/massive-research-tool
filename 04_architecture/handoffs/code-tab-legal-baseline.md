# Code tab handoff — Legal baseline (drafted 2026-06-22 — indie-solo MVP scope)

> **Legal baseline = 3 legal pages (Terms of Service / Privacy Policy / Cookie Policy) + a cookie consent banner + a signup-time Terms acceptance gate + an audit table that records who accepted what version when.** Smallest deliverable in the queue. **~1.5 weeks Code-tab time** across 5 small PRs + a few hours of owner content work outside Code tab.
>
> **Why now:** owner is launching as an indie solo dev. Without these, every signup is legal exposure (no contract terms in force) and every EU/UK visitor exposes the project to GDPR/PECR violations on cookies. The minimum bar protects the platform + clarifies what users actually agree to. This is NOT enterprise-grade SOC 2 / DPA / lawyer-reviewed copy — that's a V2.x+ track when institutional adoption arrives. This is "indie-app minimum so the platform isn't legally naked."
>
> **Scope-locked 2026-06-22 (indie-solo defaults applied):**
> 1. ✅ **Generator-based content** (not lawyer-drafted). Owner picks a generator service (recommended: **Termly free tier** OR **Termageddon one-time**); generates baseline ToS + Privacy + Cookie Policy; pastes into the 3 page files. Lawyer review = V2.x+ once institutional customers ask.
> 2. ✅ **Three legal documents, not five.** Skip Acceptable Use Policy + DPA for V1 (defer to V2.x; institutional researchers will ask for DPA when they need it — handle then).
> 3. ✅ **Cookie banner is custom build, not third-party** (Cookiebot / OneTrust / etc. = overkill + recurring fee). ~3 days Code-tab.
> 4. ✅ **Two consent tiers, not granular per-vendor:** "Accept all" vs "Necessary only". Skip "Manage preferences" with per-vendor toggles for V1 — adds complexity, indie-stage users barely engage with it. Add granular toggles when PostHog / heavy analytics arrive.
> 5. ✅ **ToS-acceptance recorded per user + per version** (audit-safe). Existing users re-prompted on minor version updates only when content materially changes (researcher-judgment, not automated).

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| `/signup` magic-link flow | V1.5 / V1.7 production-shipped; Clerk-backed; no legal-acceptance checkbox today. | `app/(auth)/signup/page.tsx` |
| Footer in marketing/auth surfaces | Minimal; doesn't link to legal pages (they don't exist). | `components/chrome/footer.tsx` (verify path) |
| Session cookie (Clerk) | Necessary cookie — auth session. No consent required under GDPR/PECR. | Clerk default behavior |
| Theme cookie (`theme=light\|dark`) | Functional cookie — researcher preference. Borderline-needs-consent in EU. | `components/chrome/theme-provider.tsx` |
| `ai_provider_connection` BYO-key encryption pattern | Demonstrates we have AES-256-GCM at-rest encryption (researchers + IRBs check). Worth surfacing in Privacy Policy. | `server/adapters/ai.anthropic.ts` + `lib/crypto/token-encryption.ts` |
| ADR-0014 PII boundary | Strict participant-data discipline (anonymous IDs, no IPs, no UA strings, no demographic joins). Critical for Privacy Policy section "How we handle participant data". | `04_architecture/adrs/0014-pii-boundary.md` |
| Sub-processor list (de facto) | Clerk / Neon / Vercel / Cloudflare / Upstash / Inngest / OSF (configured per-workspace) / Anthropic (configured per-workspace) / Hume (V2.1). Needs to be disclosed in Privacy Policy. | (currently undocumented as a list) |
| `is_demo` content flagging (V1.12) | Demo content excluded from public surfaces; relevant to Privacy Policy "How we use anonymized data". | `experiment.is_demo` |

## What's missing (the legal-baseline build)

- 3 legal pages: `/legal/terms`, `/legal/privacy`, `/legal/cookies` (Markdown-rendered, owner-maintained content)
- Cookie consent banner (first-visit; respects choice in localStorage + server-side row)
- ToS-acceptance checkbox on signup (required to complete signup)
- `legal_acceptance` audit table (who accepted what version when)
- Re-prompt flow when a new ToS version supersedes the one a researcher previously accepted
- Footer links to all 3 pages (in marketing + authenticated surfaces)
- `cookie_consent` server-side persistence (per-user once authed)
- Sub-processor disclosure list (kept in a single source of truth, embedded in Privacy Policy)

---

## Section LG1 — Three legal pages (`/legal/terms`, `/legal/privacy`, `/legal/cookies`) (~2 days)

Owner generates the content from a service (see Owner-track work section); Code tab builds the rendering surface.

### Route + rendering

- `/legal/terms`, `/legal/privacy`, `/legal/cookies` — all three are top-level public routes (not authenticated; crawlable by search engines for legal-discoverability + SEO)
- Each page renders Markdown content from a versioned file in the repo:
  - `05_app/content/legal/terms-v1.md`
  - `05_app/content/legal/privacy-v1.md`
  - `05_app/content/legal/cookies-v1.md`
- Markdown rendered via the same `marked + DOMPurify` pipeline that V1.7 Share comments use (ADR-0015 allowlist)
- Each page header shows: page title + "Last updated: {date}" + "Version: v{n}" (parsed from a frontmatter block at the top of the .md file)

### Frontmatter convention (per file)

```yaml
---
version: 1
effective_date: 2026-06-22
summary_of_changes: Initial version
---
```

### Versioning + supersession

- Bumping the version (changing `v1.md` → `v2.md` AND updating the version-pointer constant in code) triggers the re-prompt flow (see LG3)
- Old versions stay accessible at `/legal/terms?v=1`, `/legal/privacy?v=1`, etc. (audit-friendly — a researcher who accepted v1 can always retrieve the exact text they accepted)
- Current-version pointer lives in `05_app/lib/legal/versions.ts` as a single object that the rest of the app reads

```ts
// 05_app/lib/legal/versions.ts
export const LEGAL_VERSIONS = {
  terms: 1,
  privacy: 1,
  cookies: 1,
} as const;
```

### Tests

- Unit: each page renders without errors; frontmatter parses correctly; old version routes work
- Unit: Markdown rendering applies the same allowlist as Share comments (no script injection)

---

## Section LG2 — Cookie consent banner (~3 days)

Custom, lean, two-tier.

### Behavior

- First-visit: banner appears bottom-fixed (above any other content; can't dismiss without choosing)
- Two buttons: **Accept all** (sets `cookie_consent = 'all'`) and **Necessary only** (sets `cookie_consent = 'necessary'`)
- A "Learn more" inline link → `/legal/cookies`
- Choice stored in:
  - `localStorage['cookie_consent']` (client-side; persists across sessions on the same device)
  - `cookie_consent` table server-side once researcher signs in (per-user, per-device combination — keep it simple: each authed device that's used to sign in gets a row)
- Banner does NOT reappear after a choice is made (until the cookie-policy version bumps — then yes, re-prompt at the next visit)

### Visual

- Compact, single-line layout on desktop ("This site uses cookies for [necessary functionality / analytics / etc.] — [Accept all] [Necessary only] · Learn more")
- Two-line stack on mobile
- Uses workspace's design tokens (warm parchment + Plex Serif)
- ⚠️ Don't dark-pattern. "Necessary only" gets equal visual weight as "Accept all" — same button size, same prominence. This matters legally (GDPR + the recent EDPB guidance on dark-pattern consent).

### What "Necessary only" means in code

Today (V1 indie launch), this affects:
- The theme cookie — STILL set (researcher preference is borderline-functional; OK under "necessary" for a usability tool). Document this in Cookie Policy.
- Future analytics (PostHog if/when added) — SUPPRESSED if `cookie_consent === 'necessary'`. Build the analytics adapter to check the consent flag before firing any event.
- Marketing cookies — N/A (we don't have any)

If owner adds PostHog later, the adapter's `track()` method becomes a no-op when consent is `'necessary'`. Document the contract in the future analytics ADR.

### Data shape

```sql
CREATE TABLE cookie_consent (
  id TEXT PRIMARY KEY,                       -- ulid
  user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,    -- nullable for pre-signup choices logged via a temporary id
  pre_signup_id TEXT,                        -- ulid; matched on signup completion via localStorage value
  choice TEXT NOT NULL CHECK (choice IN ('all', 'necessary')),
  cookie_policy_version INTEGER NOT NULL,    -- the version they accepted against
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent_hash TEXT,                      -- per ADR-0014: ONE-WAY hash of UA string; never raw UA
  ip_country TEXT                            -- coarse country only (cf-ipcountry header from Cloudflare); never IP
);
```

Owner-locked default: choice is per-user-per-device (one row per signin event). Don't overthink dedup.

### tRPC procedures

- `cookieConsent.set({ choice, cookiePolicyVersion })` — `publicProcedure` (works pre-signup)
- `cookieConsent.current()` — returns the latest row for the current session (auth-aware; falls back to pre_signup_id if not authed)

### Wireframe gates

- `03_design/wireframes/cookie-consent-banner.md`

### Tests

- Unit: first visit shows banner; choosing dismisses it; subsequent visits don't show it
- Unit: cookie-policy version bump re-shows the banner
- Unit: pre-signup choice + signup completion correctly links the row to the new user
- Unit: `cookie_consent === 'necessary'` blocks any registered analytics adapter from firing

---

## Section LG3 — ToS-acceptance gate on signup + version-bump re-prompt (~2 days)

### Signup integration

- Existing `/signup` magic-link flow gains a required checkbox above the submit button:
  > ☐ I agree to the [Terms of Service](/legal/terms) and acknowledge the [Privacy Policy](/legal/privacy).
- Submit button disabled until checked
- On submit: records a `legal_acceptance` row for each of `terms` + `privacy` (cookies acceptance lives in LG2's `cookie_consent` table — separate audit; same researcher should appear in both)

### Re-prompt flow

When the version of any document bumps:

- On the next sign-in by a researcher whose latest accepted version is below current: a modal blocks the workspace and shows:
  > **Our [Terms of Service / Privacy Policy] has been updated.**
  >
  > **What changed:** {summary_of_changes from the frontmatter}
  >
  > [View full document] [I accept] [Sign out]
- Researcher must click "I accept" to proceed; clicking "Sign out" logs them out (no acceptance = no access)
- "I accept" writes a new `legal_acceptance` row

### Data shape

```sql
CREATE TABLE legal_acceptance (
  id TEXT PRIMARY KEY,                       -- ulid
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('terms', 'privacy', 'cookies')),
  document_version INTEGER NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_country TEXT,                           -- cf-ipcountry; never raw IP
  user_agent_hash TEXT                       -- one-way hash
);

CREATE INDEX legal_acceptance_user_kind ON legal_acceptance (user_id, document_kind, document_version);
```

### tRPC procedures

- `legal.acceptOnSignup({ termsVersion, privacyVersion })` — `publicProcedure` (called as part of signup flow)
- `legal.acceptUpdate({ documentKind, documentVersion })` — `protectedProcedure`; for the re-prompt modal
- `legal.outstandingAcceptances()` — `protectedProcedure`; returns the list of `{ documentKind, currentVersion }` the researcher hasn't yet accepted; called on every page load via a layout-level effect so the re-prompt modal can trigger

### Wireframe gates

- `03_design/wireframes/signup-tos-acceptance.md` (extends existing signup wireframe with the checkbox)
- `03_design/wireframes/legal-update-modal.md`

### Tests

- Unit: signup without checkbox fails
- Unit: signup with checkbox writes 2 `legal_acceptance` rows (terms + privacy)
- Unit: version bump + next-signin triggers modal; "I accept" writes new row; "Sign out" logs out
- e2e: researcher who already accepted v1 doesn't see modal; researcher accepting v1 with current=v2 sees modal

---

## Section LG4 — Footer + auth-surface links (~half day)

Tiny but easy to forget.

### Where the 3 legal links appear

- Marketing site footer (every page)
- Authenticated app footer (every page; minimal — just 3 small text links)
- `/signup` and `/signin` pages (below the form)
- Settings · Account → small "Legal" sub-section linking to the 3 pages + "View your acceptance history" linking to `/legal/my-acceptances`

### `/legal/my-acceptances` page (~1 day, optional but recommended)

A page where researchers can see:
- Which documents they've accepted (per kind + per version + date)
- Plain-text + downloadable proof for institutional records (e.g., for an IRB submission asking "what terms is the platform you're using bound by?")

```ts
// minimal — table rendered from legal.myAcceptances()
{
  terms: [{ version: 1, accepted_at: '2026-06-25', summary: '...' }, { version: 2, accepted_at: '2026-08-01', summary: '...' }],
  privacy: [...],
  cookies: [...]
}
```

Includes a "Download as PDF" affordance (uses the same `@react-pdf/renderer` pipeline V1.12 PDF export uses).

### Wireframe gates

- `03_design/wireframes/footer-with-legal-links.md`
- `03_design/wireframes/my-acceptances.md`

---

## Section LG5 — Sub-processor disclosure single source of truth (~half day)

Privacy Policy needs to list every third party that processes data on MRT's behalf. Today that list lives implicitly in `04_architecture/lock-in-inventory.md` — the legal version needs to be researcher-friendly.

### Approach

A single Markdown file `05_app/content/legal/sub-processors.md`:

```markdown
| Sub-processor | Purpose | Location | Data accessed |
|---|---|---|---|
| Clerk | Authentication | USA | Email, display name, OAuth tokens |
| Neon (PostgreSQL) | Database hosting | EU/USA | All researcher and participant data |
| Vercel | Application hosting | USA | Request/response data; no direct DB access |
| Cloudflare R2 | Asset storage | Global | Uploaded images, audio, video, generated TTS |
| Cloudflare CDN | Content delivery + DDoS protection | Global | HTTP request metadata (coarse country only) |
| Upstash Redis | Rate limiting | USA (or other) | Anonymous one-way-hashed coarse-IP buckets; never raw IPs |
| Inngest | Background jobs | USA | Job metadata; participant data only as required for the job |
| OSF (per-workspace BYO) | Preregistration registry | USA | Study metadata; researcher-initiated only |
| Anthropic Claude (per-workspace BYO) | AI text features | USA | Researcher-authored prompts; participant text per study config |
| Hume AI (per-workspace BYO, V2.1+) | Voice + emotion AI | USA | Researcher-authored content; participant audio/text per study config (with explicit consent) |
| Prolific (per-workspace BYO, V1.15+) | Participant recruitment | UK | Recruitment metadata; participant identifiers are opaque |
```

This file gets `<include>`d into the Privacy Policy page rendering (server-side substitution before Markdown render). Update sub-processors → update one place → Privacy Policy stays current.

### Tests

- Unit: the include substitution works; Privacy Policy page renders with the sub-processor table inline

---

## ADRs needed

- **ADR-00XX — Legal-baseline scope + custom cookie consent + content versioning.** Locks: generator-based content (not lawyer-drafted for V1); 2-tier consent (Accept all / Necessary only); per-user-per-device consent tracking; version-bump re-prompt flow; sub-processor disclosure mechanism; the `legal_acceptance` and `cookie_consent` tables.

1 ADR only. This is small.

---

## Wireframes needed

- `cookie-consent-banner.md`
- `signup-tos-acceptance.md` (extends signup)
- `legal-update-modal.md`
- `footer-with-legal-links.md`
- `my-acceptances.md`
- `legal-page-template.md` (one wireframe; covers terms + privacy + cookies which share identical layout)

6 wireframes; all small.

---

## Sequencing PRs (~1.5 weeks total)

**Stream LG (~1.5 weeks):**
- PR LG.1: Legal page route + Markdown rendering + frontmatter parser + `versions.ts` pointer + empty content stubs awaiting owner paste-in (~2 days)
- PR LG.2: Cookie banner widget + `cookie_consent` schema + `cookieConsent` tRPC router + localStorage persistence + pre-signup → post-signup linking (~3 days)
- PR LG.3: ToS-acceptance checkbox on signup + `legal_acceptance` schema + `legal.acceptOnSignup` + `legal.outstandingAcceptances` + re-prompt modal + layout-level acceptance check (~2 days)
- PR LG.4: Footer links + `/legal/my-acceptances` page + PDF export (~1 day)
- PR LG.5: Sub-processor disclosure file + include-substitution into Privacy Policy + ADR (~1 day)

All sequential; no parallelism needed (small enough to land back-to-back).

---

## Owner-track work (not Code tab)

This is the half of the deliverable that isn't engineering. Code tab can't do it without you.

### Content generation (~2-4 hours total)

1. **Pick a generator** (recommended in order):
   - **Termly** — free tier exists; covers GDPR + CCPA basics; ~$10-30/mo if you upgrade. Simplest.
   - **Termageddon** — one-time fee ~$200-600; you own the docs outright; manual updates required when laws change.
   - **Iubenda** — commercial; ~$30-100/mo; comprehensive; overkill at this stage.
2. **Generate baseline ToS + Privacy Policy + Cookie Policy** (~1 hour) — answer the generator's wizard about your business (it'll ask: "do you collect payment info?", "do you process EU users' data?", "do you use cookies?", "do you use third-party services like Google Analytics?")
3. **Customize the generated content** (~1-2 hours):
   - Insert your sub-processor list (use the Section LG5 file as source of truth)
   - Add a participant-data section explicitly stating ADR-0014 PII discipline (no IPs / no UA strings / one-way hashes / anonymous IDs / withdraw flow)
   - Add an AI-non-determinism disclosure (per ADR-0061 amendment 1 — Anthropic-generated content)
   - For V2.1 ship: add a biometric-data section (per ADR-0014 amendment for Hume)
   - Insert business name + contact email + jurisdiction (most generators default to your country)
4. **Paste each finalized document into the matching `.md` file** under `05_app/content/legal/`. Set frontmatter version to 1, effective_date to today, summary_of_changes to "Initial version".
5. **Sanity-check live pages** before opening signup.

### Lawyer review (skip for V1; flag for V2.x)

You're indie-solo at MVP. A lawyer consult ($1-3k for a SaaS/GDPR-experienced firm to review the generator output) is worth it before:
- Your first institutional/university contract is signed
- You collect first paid revenue from a researcher
- You receive your first formal data-protection request
- You enable Hume voice analysis publicly (the biometric data class is a non-trivial legal surface)

Until then, generator-baseline is the right tradeoff.

### Cookie disclosure honesty

**What MRT actually sets in cookies today** (verify before LG.2 ships):
- Clerk session cookie (necessary — auth)
- Theme preference (functional — researcher UX)
- CSRF token if any (necessary)
- `cookie_consent` (necessary — to remember the consent choice itself)

Make sure the Cookie Policy lists exactly these. Don't list cookies you don't actually use.

---

## Open questions for the owner

1. **Which generator?** Termly (free tier; recommended for indie) vs Termageddon (one-time fee, manual updates) vs Iubenda (commercial, comprehensive). Default = Termly free tier if you don't have a preference.
2. **Business entity for "Data Controller" listing?** Sole proprietorship under your name? Will a registered LLC/limited company exist by launch? Affects what name + address goes in the Privacy Policy "data controller" field. Owner-only research; not Code tab work.
3. **Jurisdiction for governing law clause?** Default in generators is usually your country of residence. Confirm or override.
4. **Lawyer consult timing?** OK to defer to V2.x institutional sales, or want to schedule one before V1.7+ launch? My recommendation: defer; you're protected enough at indie-solo stage with generator baseline.

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/adrs/0014-pii-boundary.md` — the most important constraint for the Privacy Policy participant-data section.
3. `04_architecture/adrs/0006-ai-plugin-architecture.md` — sensitivity-tag routing; affects how the Privacy Policy describes AI processing.
4. `04_architecture/adrs/0007-path-a-vs-b.md` — adapter discipline; supports the "sub-processors are swappable behind seams" claim.
5. `04_architecture/adrs/0015-notifications-comments-activity.md` — the Markdown allowlist (`marked + DOMPurify`) that legal page rendering reuses.
6. `04_architecture/lock-in-inventory.md` — source for the sub-processor list.
7. `05_app/app/(auth)/signup/page.tsx` — existing signup flow to amend.
8. `05_app/components/chrome/footer.tsx` (verify path) — footer surfaces to update.

---

## What's NOT in this scope (deferred)

- **Acceptable Use Policy (AUP).** A standalone document banning prohibited research uses (deceptive harm, illegal data collection, etc.). Defer to V2.x when AI-conversation / Hume features increase misuse surface area. For V1, brief AUP-style language inside ToS is sufficient.
- **DPA template for institutional researchers.** When your first institutional researcher asks for one, draft it then (or buy a template from your generator service). V1 = on-demand; not pre-built.
- **Lawyer-reviewed content.** Defer per the indie-solo scope decision. Plan to do this before first paid institutional contract.
- **Per-vendor granular consent toggles.** "Accept analytics but not [other]" UX. Build this if/when consent fatigue causes drop-off OR when you add a third-party that genuinely needs separate opt-in.
- **Cookie consent for cross-site tracking.** N/A — MRT doesn't do cross-site tracking.
- **Geo-targeted consent variations** (e.g., showing the banner only in EU). For V1, show the banner everywhere — simpler + safer + the cost is just one extra click for non-EU users.
- **Marketing site separate legal pages.** When/if the marketing site becomes its own Next.js app, those pages live there too — copy or share the content. For V1, marketing-site is the same Next.js app as the product, so one source covers both.
- **SOC 2 / ISO 27001 / formal security certifications.** Defer to enterprise sales era. The Security page (separate handoff candidate) communicates posture without certification.
- **Data Subject Access Request (DSAR) automation.** The right researcher (or their participant) can ask for their data. V1 = manual handling via email (`privacy@myresearchlab.app`). V2.x = build the automated export + delete flow.
- **Cookie banner localization.** English-only for V1. Translate when you have non-English research users.
- **Audit log of policy updates that triggered re-prompts.** Implicit in the `legal_acceptance` table; no separate audit needed.

When green: ping owner. Owner pastes the 3 generated legal documents into the 3 `.md` files; runs a smoke test (open signup in a private browser → see ToS checkbox + cookie banner → accept → land in workspace → bump a version → next signin shows the modal); signs the audit log; tags the release.
