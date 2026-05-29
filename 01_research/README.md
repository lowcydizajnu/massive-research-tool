# 01_research — the science layer

The substrate for every product decision. What we know about how people think, attend, remember, feel, and behave, and what that means for the tool we are building.

```
literature/      Per-paper notes — full citation, claim, evidence strength, our use
protocols/       Experimental paradigms we adopt or adapt — what we keep, what we change
insights/        Synthesized findings ready to inform product and design decisions
decisions/       Research-informed calls that shape the product
user-research/         Our user research on PIs, RAs, participants — interview guides at top level; raw notes in notes/; synthesis promotes to insights/
```

## Read first

- `../00_meta/rules/research-rules.md` — the rules that govern what goes here.
- `../00_meta/templates/research-protocol-template.md` — when adding a protocol.

## How material moves out of this folder

A literature note that just sits here is not yet useful. The flow:

```
literature/  →  insights/  →  Product (personas, flows)  →  Design  →  App
                    ↓
                decisions/  (when an insight forces a non-obvious product choice)
```

If you cannot trace a literature note through to an insight, and an insight through to a downstream effect, it is reading material, not research output.

## A note on the literature-review-helper skill

The `literature-review-helper` skill is the fastest way to seed this folder for a new question. It produces a structured Word doc; convert the doc's relevant sections into per-paper notes (`literature/{slug}.md`) and synthesized insights (`insights/{slug}.md`) so they enter the dependency graph properly. Do not let the original Word doc be the primary record — markdown files are queryable, diff-able, and linkable.
