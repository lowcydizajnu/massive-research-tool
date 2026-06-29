# Massive Research Tool — landing page content + structure

> **Drafted 2026-06-22.** Full copy + section structure for the marketing-site landing page at `myresearchlab.app`. v0.7 design language (warm-white + emerald + Plex Serif). Audience: **young researchers (PhD students, postdocs, early career) + professional academics (faculty, established PIs)**. Tone: scholarly editorial + modern confidence, never startup-noisy.
>
> **What this file is:** the copy + section flow. Designers + Code tab can implement directly from this. Visual mockup of hero + 3 sections lives in the chat thread (saved 2026-06-22; reconstructable via show_widget).
>
> **What this file is NOT:** a Code-tab implementation handoff (that's a follow-on if you want it). This is content + intent; engineering scope comes later.

---

## Audience considerations

**Young researchers (PhD students, postdocs):**
- Want: modern tool that doesn't waste their time; learning curve they can climb; social proof; ease of use
- Worry about: looking unprofessional to their advisor by picking a "trendy" tool over Qualtrics; tool disappearing mid-PhD; not being able to export data when they need to leave

**Professional academics (faculty, PIs):**
- Want: methodological control; rigor signals; IRB-friendly; reputation-safe; data-control; depth, not just surface
- Worry about: untested tools risking their published work; vendor lock-in; getting their students hooked on something fragile; SOC 2 / GDPR / institutional procurement

**Bridge between the two:**
- Both groups care about: replication crisis, open science, preregistration, transparency, data ownership
- Both groups respect: OSF integration, version control, methodology rigor
- Both groups are skeptical of: pricing tricks, lock-in, vague feature lists

The copy below threads this needle — confident + modern + visually current, but grounded in rigor signals and methodology depth, not startup hype.

---

## Page structure (top to bottom)

1. **Hero** — headline + subhead + CTAs + trust microcopy
2. **Pain points (dark inverse section)** — "Tired of..." list
3. **End-to-end workflow** — visual flow with all 7 stages
4. **Core features (6-card grid)** — what sets MRT apart
5. **Open community + Explore tease** — featured public studies
6. **Built on rigor (trust signals row)** — OSF, GDPR, BYO-AI, open methodology
7. **Comparison strip** — MRT vs Qualtrics + OSF + Prolific separately
8. **Pricing tease** — free + institutional partnerships
9. **For young researchers / For PIs** — two-column audience-specific value props
10. **Documentation + resources** — Mintlify docs link, quickstart, block catalogue
11. **Final CTA** — "Ready to run better research?"
12. **Footer** — legal links, social, status page, sub-processors

---

## 1. Hero

**Eyebrow:** `MASSIVE RESEARCH TOOL` (with brand emerald dot before it)

**Headline (H1, Plex Serif 48-52px, weight 500, tight letter-spacing):**

> Built for science that **actually replicates**.

(The "actually replicates" phrase in brand emerald `#047144`.)

**Subhead (Plex Sans 17px, weight 400, secondary text color):**

> The research platform with version control, one-click replication, and end-to-end workflow — from hypothesis to preregistration to published findings. **Qualtrics for designing studies. GitHub for tracking them. OSF for preregistering them. One tool.**

**Primary CTA (emerald button):** `Start free →`
**Secondary CTA (ghost button):** `Watch the demo`

**Microcopy below CTAs:**

> Free for individual researchers · BYO Prolific / OSF / Anthropic / Hume · No credit card

**Hero visual options** (pick one):
- A) App screenshot of the Builder showing a study with conditions + version sidebar (most concrete)
- B) Animated GIF of the version-comparison view (shows the GitHub-like superpower)
- C) Stylized illustration of a researcher at a desk with a forked branch growing out of their study (more brand-coded)
- **Recommend: A) app screenshot first** — researchers want to see the actual tool, not metaphors. Save illustration energy for later sections.

---

## 2. Pain points — "Tired of…" (dark section)

This section uses an **inverted dark background** (v0.7 dark page bg `#0A0E0C`) to break visual rhythm and signal "this is the problem we solve." The emerald `#4AD693` arrows + accent color cuts through the dark.

**Eyebrow:** `THE STATUS QUO`

**Headline (Plex Serif, 36px):**

> Tired of…

**Five pain-point lines (each with an emerald → arrow + bolded lead phrase):**

> → **Rebuilding the same study** three times across three tools (Qualtrics, OSF, Prolific) just to run it once.
>
> → **Replicating a published study** meaning rebuilding it from scratch out of the methods section.
>
> → **Losing track of which version** your last 200 participants actually saw.
>
> → **Modern stimulus types** (audio, voice conversation, emotion scoring) being either impossible or a hack.
>
> → **Paying per response** just to collect data when your grant is already paying for participants.

**Optional sixth (for academic PIs):**
> → **Vendor lock-in** that means leaving means losing five years of study designs.

---

## 3. End-to-end workflow

**Eyebrow:** `END-TO-END`

**Headline (Plex Serif, 32px):**

> One tool. The whole workflow.

**Subhead (Plex Sans, 15px, secondary):**

> No more juggling six tools. MRT covers the full research lifecycle in one workspace — with version control under every step.

**Visual:** horizontal scroll of 7 stages with → arrows between them. Each stage is a small card with a Tabler icon + label:

| Stage | Icon | Description (tooltip / hover) |
|---|---|---|
| Playground | `ti-bulb` | Collect inspiration, links, drafts before a study exists |
| Design | `ti-pencil` | Drag blocks, set conditions, configure variants |
| Preregister | `ti-stamp` | One-click OSF preregistration; frozen version forever |
| Recruit | `ti-users` | Connect Prolific or open recruitment to your own panel |
| Run | `ti-player-play` | Participants take the study; real-time response collection |
| Analyze | `ti-chart-bar` | Live results, condition breakdowns, exports in any format |
| Replicate | `ti-git-fork` | Fork any public study; track divergence from the original |

**Caption (italic, small):**

> Every step versioned. Every change tracked. Every study replicable.

---

## 4. Core features — what sets MRT apart

**Eyebrow:** `BUILT FOR RIGOR`

**Headline (Plex Serif, 32px):**

> What sets MRT apart

**Six feature cards in a 3-column grid (2-column on mobile):**

### Card 1 — Version everything
**Icon:** `ti-git-commit`
**Headline:** Version everything
**Body:** Every save is a version. Every preregistration is frozen forever. Compare versions side-by-side. Restore any prior state. Your changelog writes itself.

### Card 2 — One-click replication
**Icon:** `ti-git-fork`
**Headline:** One-click replication
**Body:** Found a study you want to replicate? Fork it into your workspace. Same blocks, same conditions — adapt freely. Original authors see who's replicating their work.

### Card 3 — Live collaboration
**Icon:** `ti-users-group`
**Headline:** Live collaboration
**Body:** See who's editing what. Comment on any block. @mention teammates. Soft-lock prevents accidental conflicts. Threaded discussions stay with the study.

### Card 4 — Modern stimuli
**Icon:** `ti-microphone`
**Headline:** Modern stimuli
**Body:** 46+ block types: text, image, audio recording, voice conversation with AI, emotion scoring, A/B factorial variants, social-media-post mockups, signature capture, hot-spot interactions.

### Card 5 — Open integrations
**Icon:** `ti-plug-connected`
**Headline:** Open integrations
**Body:** OSF preregistration. Prolific recruitment. Anthropic Claude. Hume emotion AI. BYO keys — your data, your accounts, no markup. Add new providers via our open adapter pattern.

### Card 6 — Radical transparency
**Icon:** `ti-eye`
**Headline:** Radical transparency
**Body:** Open by default. Public studies are forkable by anyone. Your workflow is visible to your team. Methodology you can audit. Source-available; commercial-friendly.

---

## 5. Open community + Explore tease

**Eyebrow:** `FROM THE COMMUNITY`

**Headline (Plex Serif, 28px):**

> Real studies from real researchers

**Subhead:**

> Browse published methodologies. Replicate any of them in one click. Be the first researchers to grow MRT's open-science library.

**Visual:** Card carousel showing 4-6 featured public studies. At launch this section might be sparse — frame it as "be among the first" rather than fake-busy. Each card:
- Cover image (or generated visual)
- Study title in Plex Serif
- Researcher byline + affiliation
- Use-count + tag chips
- Replicate CTA

**Empty-state fallback for launch:**
> Be among the first researchers to publish a study in the open MRT library. Your work becomes a starting point for replications.

**Section CTA:** `Browse all studies →` (links to `/explore`)

---

## 6. Built on rigor — trust signals row

A horizontal row of 4-5 trust indicators. Subtle visual treatment (small icon + label + 1 line). Sits beneath community, before pricing, gives PIs the "this is serious" signal they need before they commit.

| Signal | Icon | Label | One line |
|---|---|---|---|
| OSF integration | (OSF logo) | OSF-native | Preregister + replicate in one click |
| GDPR / PII | `ti-shield-lock` | GDPR-compliant | Anonymous participant IDs by default; ADR-0014 boundary |
| BYO-AI | `ti-key` | BYO API keys | Your vendor accounts, no markup, no lock-in |
| Open methodology | `ti-book-2` | Open methodology | Every design decision documented; ADRs public |
| Adapter architecture | `ti-puzzle` | Swap any vendor | Clerk / OSF / Prolific / AI providers all replaceable |

---

## 7. Comparison strip — MRT vs separate tools

**Eyebrow:** `BEFORE / AFTER`

**Headline (Plex Serif, 28px):**

> Replace six tools with one workspace.

**Visual:** A simple two-column comparison.

**Left column (light gray background, semi-transparent):**
> **Before MRT**
>
> - Qualtrics — building the study ($$$/yr seat license)
> - OSF — preregistration (free but disconnected)
> - Prolific — recruitment (pass-through but you re-key everything)
> - Word doc — methodology notes
> - Google Sheets — tracking which version ran when
> - Email threads — collaboration
> - Cost: ~$2,000-15,000 per researcher per year

**Right column (white card with emerald accent):**
> **With MRT**
>
> - One workspace covering design + preregistration + recruitment + collaboration + version history + replication
> - One subscription (free for individuals; institutional pricing for departments)
> - Cost: free for individual researchers; BYO Prolific/AI vendor costs

---

## 8. Pricing tease

**Eyebrow:** `PRICING`

**Headline (Plex Serif, 32px):**

> Free for researchers. Worth it for institutions.

**Two-column tier preview:**

### Free
- Unlimited studies in your personal workspace
- All 46+ block types
- BYO Prolific / OSF / Anthropic / Hume (you pay vendors directly, no markup)
- Public-studies community + one-click replication
- Open-source methodology + ADRs
- **$0 forever**

### Institutional partnership
- Everything in Free, plus:
- Dedicated workspaces for your lab / department / faculty
- SSO via SAML / Shibboleth
- DPA + GDPR institutional contract
- Admin dashboard + cost rollups
- Direct support + roadmap input
- **From $50k/year — talk to founders**

**CTA:** `Start free` (primary) · `Talk about institutional →` (secondary, links to partnership page)

---

## 9. Two-column: for young researchers / for PIs

This is where the audience-bridge work happens. Two columns; each speaks directly to one audience.

### Left column — For PhD students + postdocs

**Headline:** Designed for the way you actually work

- Build complex studies without writing a line of code
- Replicate any published methodology in one click — perfect for your literature review
- Comment with your advisor on specific blocks, not "the whole survey"
- Save versions before every meeting; restore if your advisor changes their mind
- Free forever; bring your own Prolific account
- Export everything in CSV / SPSS / R-friendly formats

**CTA:** `Start your first study →`

### Right column — For PIs + lab directors

**Headline:** Built for the methodological standards you uphold

- Preregistration is the default, not an afterthought
- Every study version is frozen + cited individually
- Cross-workspace replications visible from your study page
- Audit trail for every change — IRB-ready out of the box
- Adapter architecture: never locked into a vendor again
- Institutional partnerships keep your lab's data in your control

**CTA:** `Talk about institutional partnership →`

---

## 10. Documentation + resources

**Eyebrow:** `LEARN MORE`

**Headline (Plex Serif, 28px):**

> Built to be understood, not just used.

**Three-column resource grid:**

| Resource | Description | CTA |
|---|---|---|
| **Quickstart guide** | From signup to running your first study in 15 minutes | Read the quickstart → (links to docs.myresearchlab.app/quickstart) |
| **Block catalogue** | Reference for all 46+ block types — when to use each, sample configs | Browse blocks → (docs/builder/blocks) |
| **Methodology guides** | Preregistration walkthroughs, replication best practices, IRB checklist | Read the guides → (docs/methodology) |

**Section CTA:** `Read the full docs →` (docs.myresearchlab.app)

---

## 11. Final CTA

**Headline (Plex Serif, 32px, centered):**

> Ready to run better research?

**Subhead:**

> Free for individual researchers. Institutional partnerships available.

**Primary CTA:** `Start your first study` (emerald button, larger than hero CTA — this is the conversion ask)
**Secondary CTA:** `Read the docs`

**Microcopy:**

> No credit card · BYO vendor accounts · Open methodology

---

## 12. Footer

**Three to four columns:**

### Product
- Studies
- Library
- Templates
- Explore
- Pricing

### Resources
- Docs (docs.myresearchlab.app)
- Block catalogue
- Methodology guides
- Status page

### Company
- About
- Blog (when one exists)
- Partnership inquiries
- Press kit

### Legal
- Terms of Service
- Privacy Policy
- Cookie Policy
- Sub-processors
- Security disclosure (`security.txt`)

**Bottom bar:**
- © 2026 Massive Research Tool — built by Paweł Rosner
- Sentence-case copyright; no shouting

---

## Visual treatment notes (v0.7)

- **Hero + workflow section:** light mode (warm white `#F8F9F7` page bg, white cards, emerald CTAs)
- **Pain-point section:** **inverted dark mode** (`#0A0E0C` page, off-white text, lighter emerald `#4AD693` accents) — single visual break to signal "this is the problem"
- **Trust signals + features:** light mode, white cards on warm gray (`#F1F3F0`) for subtle tier
- **Final CTA:** centered, breathing room, single primary action
- **Plex Serif** for all headlines (H1 / H2 / H3); **Plex Sans** for body + UI
- **Hierarchy through size, not color** — color stays disciplined; one accent (emerald) does all brand work
- **No stock photography** — use the v0.7 design language as the visual identity; commission 2-3 hero illustrations if budget allows (see the illustration brief in `00_meta/business-development/` when drafted)
- **Mobile-first** — every section reads in a single column at 375px; comparison strip stacks; workflow becomes vertical scroll
- **Performance:** Next.js static generation; no JavaScript-heavy effects; emerald accent + Plex Serif fonts loaded synchronously to avoid FOUT

---

## Asset inventory for Code tab to build this

**Required:**
- App screenshot of Builder (with version sidebar showing) — for hero
- Mintlify docs site live at docs.myresearchlab.app (per Explore + Engagement handoff)
- `/explore` route live (per Explore + Engagement handoff)
- Partnership-inquiry page or contact email

**Nice to have:**
- 2-3 commissioned hero illustrations (see illustration brief; ~$1-2k investment)
- Animated GIF of version-comparison view
- Featured public studies (even 3-4 from owner's own seeded examples is enough for launch)

**Component primitives needed (most exist):**
- Hero section component
- Inverted-dark section component
- Workflow stepper (horizontal scroll on mobile, full row on desktop)
- Feature card grid (2-3 column responsive)
- Comparison column component
- Pricing-tier card
- Footer (multi-column)

---

## Voice + tone checklist

Before publishing, verify:

- [ ] Sentence case everywhere (no Title Case headlines)
- [ ] No "leverage", "seamless", "unlock", "empower", "simply", "just", "easy"
- [ ] No "please" / "successfully" / "click here"
- [ ] Active voice, verb-first CTAs
- [ ] No exclamation marks on system copy
- [ ] Contractions OK ("can't", "won't")
- [ ] Title Case ONLY for proper nouns (Claude, OSF, Prolific, Hume, Anthropic, Mintlify, GitHub, Qualtrics)
- [ ] Sentence punctuation: periods inside parentheticals when full sentences; outside when clauses
- [ ] Em-dashes (—) not hyphens (-) for parenthetical breaks
- [ ] One primary CTA per visible area
- [ ] Every claim concrete enough that you could defend it to a methodologist

---

## What's NOT in this landing page (intentional)

- **Customer logos** — you don't have any yet; faking these destroys credibility. Add when you have 3+ institutional partners.
- **Testimonials** — same reason. Add when you have real researcher quotes.
- **Pricing calculator** — premature; you're not at scale where this helps.
- **Live demo embed** — requires production-stable demo workspace; defer until V2.x
- **Blog tease** — no blog yet; add when one exists.
- **Newsletter signup** — defer; people who care will find their way to docs.
- **Comparison vs specific competitors named** — "MRT vs Qualtrics" is dangerous (legal); the comparison strip says "before/after" abstractly. Don't name Qualtrics + SurveyMonkey + Sona by name unless you've talked to a lawyer about comparative advertising in EU/US.
- **Status page link in main nav** — keep in footer only; not a top-line trust signal yet.

---

## What to commission/finish before launch

| Item | Owner-side work | Code-tab work |
|---|---|---|
| Hero app screenshot | Take a clean screenshot of Builder with sample study + version sidebar (~10 min) | Optimize + embed in hero |
| Mintlify docs live at docs.myresearchlab.app | Sign up + DNS + initial content (~1 week part-time) | `<HelpLink>` integration (per Explore handoff) |
| `/explore` route live with 3-5 featured studies | Seed featured studies (use your own as starter) | Build per Library-completion + Explore+Engagement handoffs |
| Partnership inquiry path | Decide: dedicated page, or just email link to your address? (recommend: simple page with the partnership one-pager content + a form) | Build per Library-completion or new mini-handoff |
| 2-3 hero illustrations (optional) | Brief + commission OR pick from Storyset Pro and recolor (~$24/mo + ~3hr work) | Embed in hero + feature sections |
| Legal pages live (`/legal/*`) | Generated content (Termly etc.) pasted into the 3 .md files | Already in Legal-baseline handoff |
| `security.txt` | None (you wrote the policy already) | Already in Platform-foundation handoff PF1.3 |
| Domain SSL + redirects | Already done in V1.7 deploy | None |

**Landing page implementation** itself: ~1-2 weeks Code-tab time once all above are ready. Not a separate handoff — fold into the Explore + Engagement + Docs handoff or as a small marketing-site PR.

---

## Three open questions for you

1. **Use the name "Qualtrics" explicitly?** You said "I think we should use name qualtrics but github is fine." Naming Qualtrics in marketing copy is legally tricky (comparative advertising — they could complain). I've used "Qualtrics" in the body once (hero subhead) for the analogy. If you want to be safer, swap to "survey tools" generically. If you want it stronger, the comparison strip in Section 7 could explicitly name Qualtrics + OSF + Prolific in the "Before" column. Confirm or override.
2. **Headline pick.** I've recommended `Built for science that actually replicates.` Alternates worth considering:
   - `Research as it should be.` (more editorial; vaguer)
   - `From hypothesis to published replication in one place.` (more concrete; longer)
   - `The research tool researchers actually deserve.` (more bold; risks reading whiny)
3. **Pricing transparency.** Section 8 shows "From $50k/year — talk to founders" for institutional. Some founders prefer "Contact us" with no number; some prefer concrete numbers. Concrete number filters out tiny budgets (good — saves your time on calls with people who can't pay) but signals high cost. Confirm or override.

If you want me to also draft the standalone "/partnership" page (institutional pricing detail + the partnership one-pager rendered as a webpage), say the word — that's another ~half-day of content work.
