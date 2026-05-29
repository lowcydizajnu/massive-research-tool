# Design rules

How we make design decisions, and what must be true before a design leaves the design phase.

## Principles

**Designed for the end user, not the operator.** The principal investigator and research assistant are users too, but the participant — the person actually completing the experiment — is the hardest target. Every screen the participant sees must be clearer, faster, and more accessible than any internal screen.

**Default to convention.** A drag-and-drop canvas with novel interaction patterns is harder to learn than one that behaves like Miro or FigJam. We innovate only where convention fails our users.

**Cognitive load is a measurable cost.** Show only what is needed to make the current decision. Progressive disclosure is the default for any screen with more than ~5 controls.

**Every state has a design.** Loading, empty, error, partial, optimistic, success. The first time you encounter a state in code that wasn't designed, stop and design it.

## Process rules

1. **No wireframe without a user flow.** The flow it serves is named at the top of the file.
2. **No high-fidelity mockup without a wireframe.** Wireframes lock structure; high-fi locks visual.
3. **No component used in a mockup that isn't in the design system.** Either add it to the system first or use a placeholder labeled "needs system entry."
4. **No screen leaves design without** a handoff spec (`design:design-handoff`), an accessibility pass (`design:accessibility-review`), and a critique pass (`design:design-critique`).

## The design system specifically

- **Tokens before components.** Color, type, spacing, radius, motion, shadow, z-index. Tokens have semantic names (`surface.muted`, `text.danger`), not raw values.
- **Variants are exhaustive.** Every component documents its variants, states (default, hover, active, focus, disabled, loading, error), sizes, and responsive behavior.
- **Documentation lives with the component.** Each component has a markdown file with usage guidance, do/don't, and accessibility notes. Use the `design:design-system` skill.
- **No one-off styling in the app.** If a button needs to be different, it becomes a variant in the design system. App code never reaches for a magic class.

## Accessibility (WCAG 2.1 AA minimum)

- All interactive elements are keyboard-reachable in a sensible order.
- Color contrast meets AA for normal text (4.5:1), AAA where feasible.
- Focus states are visible and never removed without a replacement.
- All form inputs have associated labels; placeholders are not labels.
- Touch targets are at least 44×44 px.
- Motion respects `prefers-reduced-motion`.
- ARIA is used to clarify, not to retrofit semantics — prefer the right HTML element.

Run `design:accessibility-review` on every screen before handoff. Findings are addressed or explicitly accepted with a recorded reason.

## UX copy

- Voice is precise, plain, and warm. Not chummy, not corporate. See `design:ux-copy`.
- Error messages tell the user what happened, why, and what to do next.
- Confirmations describe what will happen if confirmed, not just "Are you sure?"
- Empty states earn their keep: they orient the user and offer a next step.
- We do not use jargon the user did not bring with them. "Trial" is fine for a researcher; explain it for a participant.

## Vocabulary: speak researcher, not developer

The product borrows powerful concepts from GitHub — fork, version, snapshot, merge, upstream, lineage. These are the right architectural primitives (see ADR-0001 and ADR-0002). **But our users are researchers, not developers.** Forcing them to learn developer jargon is friction we should not be charging them for.

The rule:

- **Internal docs** (ADRs, briefs, this rules file, architecture diagrams) use developer-precise terms. Precision matters when architecting.
- **User-facing surfaces** (UI labels, button copy, error messages, in-product help, marketing) use researcher-native language. Empathy and familiarity matter when using.
- The two vocabularies are linked by the translation table below, maintained as features ship.

### Starter translation table

| Internal / architecture term | User-facing (starting points — pick per context) |
| --- | --- |
| Fork (replication intent) | Replicate · "Run this study as published" · "Create a faithful copy" |
| Fork (template intent) | Adapt · "Build upon" · "Start from this" · "Make my version" |
| Snapshot / version | Saved version · Milestone · "What this study looked like on YYYY-MM-DD" |
| Preregistered version | Preregistration · "Locked for OSF" (already researcher-native) |
| Published version | Published · Released (already researcher-native) |
| Autosave version | History entry · "Auto-saved" (background — usually invisible to users) |
| Lineage / parent | Origin · "Adapted from [Author]'s study" · "Based on [Framework]" |
| Module | Question · Item · Artifact · "Block element" (depending on slot) |
| Module schema | (don't expose — implementation detail) |
| Theme overlay | Workspace · "Misinformation workspace" · "Custom workspace" |
| Module registry | Library · "What you can add" |
| Pull from upstream (V2+) | "Adopt updates from the original" · "Sync with the original study" |
| Merge (V2+) | "Combine with…" · "Suggest a change to [Author]" |
| Branch | (avoid — V1 does not expose branches at all) |
| Repo | Project · Study · Workspace |
| Commit | Save (already familiar) |
| Plug-in / extension | Add-on (V3+, when relevant) |

Treat the table as a starting point. When a feature ships, the chosen label is final the moment it hits the design system — changes after that require a deprecation pass on old labels. As the table grows past ~30 entries, it graduates into its own file (`03_design/vocabulary.md`) and gets indexed from the IA.

### Why this matters specifically here

The wedge is "Qualtrics + GitHub for research." Researchers know the *Qualtrics* side. They will accept GitHub-like power if the surface looks and reads like a research tool. They will bounce off it if the surface looks like a developer tool. **The architecture can be ambitious; the surface must be familiar.**

When in doubt: ask a researcher how they would describe what they're trying to do. Their phrasing is usually closer to correct than anything we invent.

## Note on the listed sequence

The original sequence you proposed was: user flows → journeys → wireframes → design inspiration → design system → IA/UX → app. Two adjustments in `PROCESS.md`:

- **Inspiration moves to the front of Design.** It informs wireframes rather than being applied retroactively.
- **IA precedes wireframes.** You cannot wireframe what you have not located in the IA.

Override these in this file (with a why) if you disagree after trying it.
