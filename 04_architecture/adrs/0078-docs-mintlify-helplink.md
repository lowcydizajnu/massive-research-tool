# ADR 0078 — Docs at docs.myresearchlab.app via Mintlify + HelpLink discipline

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** docs, growth, lock-in, content

## Context

The Explore + Engagement + Docs handoff stream EE4 adds **researcher documentation**: a hosted docs site + contextual in-app `?` links that deep-link into it. Today there is no help surface — researchers hit a non-obvious feature (conditions, variants, OSF push) and have nowhere to look. The handoff owner-locked **Mintlify** (hosted, ~$0–50/mo) over self-hosting to save weeks, and the owner has since added the Mintlify connector. The decision here records the hosting choice, the in-app linking discipline, and where content lives — plus the guardrails that keep docs links from rotting.

## Options considered

### Option A — Mintlify-hosted docs + a typed `<HelpLink>` discipline + content in-repo (chosen)

- Docs at `docs.myresearchlab.app` (Mintlify, themed to match the app). In-app help is a single `<HelpLink docKey="…">` component backed by a typed `DOC_URLS` map; content (MDX) lives in a `docs/` directory in this repo so it's versioned and reviewable, and a CI check flags `DOC_URLS` entries with no live page.
- **Pros:** fast to ship; Mintlify handles search/nav/dark-mode/SSL; typed `docKey` makes broken links a compile error; in-repo content = versioned + diffable + LLM/owner-authorable; CI surfaces missing pages to the owner, not the researcher.
- **Cons:** a vendor (Mintlify) for hosting; ongoing content authoring is real work (esp. the per-block catalogue); docs theming can't perfectly match the app.

### Option B — In-app docs (MDX pages rendered inside Next.js)

- Render docs as app routes.
- **Pros:** one deploy, exact design-token parity, no vendor.
- **Cons:** rebuilds search/nav/versioning that Mintlify gives free; bloats the app bundle/build; SEO + public discoverability weaker; more code to maintain. Not worth it at indie scale.

### Option C — A third-party help desk (Intercom/HelpScout articles)

- **Pros:** support workflows bundled.
- **Cons:** recurring cost; overkill pre-volume; content locked in a vendor CMS, not versioned. Deferred (revisit when support volume justifies).

## Decision

**We will host docs on Mintlify at `docs.myresearchlab.app`, drive all in-app help through a typed `<HelpLink docKey>` component over a `DOC_URLS` map, keep docs content as MDX in a `docs/` directory in this repo, and add a CI check that flags `DOC_URLS` keys without a live page.** The `docKey` union makes an unknown/typo'd link a build error; an unwritten page degrades to Mintlify's "coming soon" (never a 404) and is reported to the owner by CI, not the researcher. Mintlify is recorded as a deliberate hosting dependency in the lock-in inventory; because content is plain MDX in-repo, a migration off Mintlify is a re-host, not a content rewrite.

## Consequences

- **Easier:** every feature can grow a `?` link with a one-liner; docs are versioned + diffable; broken links can't ship; content can be authored by the owner or an LLM straight in the repo.
- **Harder:** ongoing content authoring (the per-block catalogue is the big backlog); keeping `DOC_URLS` and the live page set in sync (mitigated by the CI check); modest Mintlify theming limits.
- **Committed to:** Mintlify hosting (env: docs subdomain CNAME); `DOC_URLS` as the single source of in-app doc links; MDX-in-repo content; the typed-key discipline.
- **Precluded (deferred):** in-app rendered docs; a help-desk CMS; per-page access control (docs are public).

## Revisit triggers

- Support volume needs ticketing/CMS → revisit Option C.
- Mintlify cost/limits bite at scale → re-host the in-repo MDX elsewhere (Docusaurus/Nextra).
- Docs need to be private/gated → reconsider in-app rendering.

## References

- `04_architecture/handoffs/code-tab-explore-engagement-docs.md` (EE4 source).
- [Get help from docs (contextual)](../../02_product/user-flows/get-help-from-docs.md) (flow).
- [HelpLink component](../../03_design/wireframes/help-link-component.md), [Docs site style guide](../../03_design/wireframes/docs-site-style-guide.md) (wireframes).
- `04_architecture/lock-in-inventory.md` (Mintlify row); ADR-0072 (announcements/tour — distinct help surfaces); https://mintlify.com/docs.
