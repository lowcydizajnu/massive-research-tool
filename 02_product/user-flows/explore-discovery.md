# User flow — Explore — discovery and activation

- **Job-to-be-done:** [Get set up](../jobs-to-be-done/get-set-up.md)
- **Primary persona:** [Postdoc operator](../personas/postdoc-operator.md)
- **Secondary personas (if any):** [Burned replicator](../personas/burned-replicator.md) (arrives via a shared public study link), [Principal investigator](../personas/principal-investigator.md) (evaluating the tool before committing a lab)
- **Grounding insights:** [Researcher tooling pain points](../../01_research/insights/researcher-tooling-pain-points.md), [Finished studies and comparable discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md)
- **Status:** draft

## Goal

> One sentence: what the user is trying to accomplish.

See, in one place, what Massive Research Tool actually lets them do — concrete use-cases, runnable starter templates, and real community studies — and get from "interested" to "I have a study open in my workspace" in a single click.

## Preconditions

> What must be true before the flow begins.

- **Authed variant:** the researcher is signed in and has at least one workspace (the LeftRail "Explore" entry is visible). Renders in app chrome.
- **Public variant:** an anonymous visitor reaches `myresearchlab.app/explore` (from a shared link, search, or the marketing header). No auth; marketing-site chrome with a sign-up CTA. Same content island, different shell.

## Postconditions

> What is true after the flow completes successfully.

- **Authed:** the chosen starter template (or community study) is forked into the researcher's active workspace and they land in the Builder on the new draft.
- **Public:** the visitor has either started sign-up (carrying the intent to fork the chosen template) or navigated into a public study Details / public profile page. After sign-up completes, the intended template is auto-forked into their new workspace.

## Happy path

> Each step names the system response and the next decision point.

1. The user opens Explore (LeftRail entry when authed; `/explore` URL when public). (Trigger: wants to see what they can build, or evaluate the tool.)
2. The page renders four bands: **use-case scenarios** (curated), **featured starter templates** (dynamic), a **wall of community studies** (dynamic), and — only if any exist — a **showcase of opt-in researchers**.
3. The user scans a use-case scenario card ("Run a misinformation study") — title, two-sentence framing, cover image, primary CTA.
4. The user clicks the primary CTA "Use this starter template".
5. **Authed:** the system forks the scenario's starter template into the active workspace and redirects to the Builder on the new draft (success). **Public:** the system routes to sign-up, preserving the fork intent; after sign-up + workspace creation, it auto-forks and lands the new researcher in the Builder.
6. (Alternate productive exits) the user instead clicks "Replicate" on a community study → fork; or "Browse public studies" → `/browse`; or a researcher avatar → `/u/<handle>`; or "Read more →" on a scenario → the relevant docs page.

## Branches and decision points

> For each non-trivial branch.

- **Decision:** authed vs anonymous when a "Use this template" / "Replicate" CTA is clicked.
  - **Path A (authed):** fork immediately into the active workspace → Builder.
  - **Path B (anonymous):** stash the fork intent (template id) → sign-up → on completion, fork into the brand-new workspace → Builder.
- **Decision:** scenario has a configured `starter_template_id` or not.
  - **Path A (has template):** primary CTA forks that template.
  - **Path B (build-from-scratch / placeholder scenario):** primary CTA routes to `/studies/new` (or shows "coming soon" when the referenced template doesn't exist yet).
- **Decision:** any opt-in public profiles exist.
  - **Path A (yes):** render the researcher showcase band.
  - **Path B (none):** omit the band entirely (no empty state).

## Failure modes

> For each plausible failure.

- **Trigger:** referenced `starter_template_id` is missing/unpublished. **System response:** the card's CTA degrades to "Browse public studies" (or "Build from scratch") and logs the broken reference for the owner; never a dead button. **Recovery:** the user still reaches a productive surface.
- **Trigger:** the post-sign-up auto-fork fails (template since unpublished, transient error). **System response:** land the new researcher on `/studies` (their empty workspace) with a non-blocking toast "We couldn't open that template — browse more in Explore." **Recovery:** Explore is one click away in the LeftRail.
- **Trigger:** dynamic queries (featured templates / community studies) return nothing (cold catalogue). **System response:** the scenario band (curated, always present) carries the page; dynamic bands collapse rather than show empty shells.

## Out of scope

> What this flow deliberately does not cover, and which other flow does.

- Authoring/curating scenarios — owner-track Markdown editing in the repo, no in-app CMS (covered by the Explore ADR, not a researcher flow).
- The public profile page itself (`/u/<handle>`) — its own flow under EE2.
- Browsing/filtering the full public catalogue — the existing [Browse public studies](../../03_design/wireframes/browse-public-studies.md) wireframe; Explore is a curated layer on top, not a replacement.
- Email-driven re-engagement (digests, nudges) — EE3.

## Open questions

> Anything we are unsure about.

- Ordering of the four bands on first paint (scenarios first is assumed; validate once content exists). — owner
- Whether the public route should pre-render (SEO) the dynamic bands or hydrate them client-side. — resolved in the Explore ADR.

## Diagram

> Embed or link the flow diagram.

```mermaid
flowchart TD
  A[Open Explore: LeftRail or /explore] --> B[Four bands render: scenarios / templates / community / researchers]
  B --> C{Primary CTA clicked}
  C -->|Use starter template| D{Authed?}
  C -->|Replicate community study| D
  C -->|Browse public studies| E[/browse]
  C -->|Researcher avatar| F[/u/handle]
  C -->|Read more| G[Docs page]
  D -->|Yes| H[Fork into active workspace -> Builder]
  D -->|No| I[Sign-up, carry fork intent] --> J[New workspace] --> H
```
