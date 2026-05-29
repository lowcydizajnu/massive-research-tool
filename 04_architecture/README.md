# 04_architecture — the system

How the product is built, not what is built. The contract between design and code.

```
adrs/             Architecture Decision Records — every non-obvious choice
diagrams/         System context, container, sequence, state-machine diagrams
data-model/       Entity definitions, ER diagrams, invariants
api-contracts/    tRPC routers, OpenAPI specs, event schemas
```

## Read first

- `../00_meta/rules/architecture.md`
- `../00_meta/rules/decision-records.md`
- `../00_meta/templates/ADR-template.md`
- `../STACK.md`

## ADR numbering

`{NNNN}-{kebab-slug}.md`, sequential, zero-padded to four digits. Start at `0001`. Never reuse a number, even for retired ADRs.

## Diagrams

Use Mermaid for diagrams that live next to text — they version-control well and render anywhere. For complex diagrams that need editing, use Figma or Excalidraw and embed an exported PNG/SVG alongside a link to the source.

Diagrams that are likely worth drawing for this product:

- **System context (C4 L1)** — the product, its users, and the systems it touches.
- **Container diagram (C4 L2)** — the deployable parts and how they communicate.
- **Sequence: auth flow** — sign-in, org switching, JWT lifecycle.
- **Sequence: experiment run** — participant arrives → consent → trials → results stored.
- **State machine: experiment runner** — every state a participant session can be in.
- **State machine: node-graph editor** — every state the canvas can be in.
- **Data model ER** — the relational backbone.

## API contracts

Contracts come *before* implementation. A new feature starts with a tRPC router definition (or OpenAPI fragment for external endpoints) saved here. The contract is the artifact reviewers approve before code is written.
