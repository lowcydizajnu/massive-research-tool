# User flow — {Flow name}

- **Job-to-be-done:** {link to JTBD doc}
- **Primary persona:** {link to persona}
- **Secondary personas (if any):** …
- **Grounding insights:** {links to entries in 01_research/insights/}
- **Status:** draft | reviewed | implemented | retired

## Goal

One sentence: what the user is trying to accomplish.

## Preconditions

What must be true before the flow begins. (Signed in, has at least one project, etc.)

## Postconditions

What is true after the flow completes successfully.

## Happy path

1. Step one. (Trigger: …)
2. Step two.
3. Step three.
…

Each step names the system response and the next decision point.

## Branches and decision points

For each non-trivial branch:

- **Decision:** what the user (or system) is deciding.
- **Path A:** when chosen, the flow continues at step N.
- **Path B:** when chosen, the flow continues at step M.

## Failure modes

For each plausible failure:

- **Trigger:** what causes the failure.
- **System response:** what we show.
- **Recovery:** how the user gets back to a useful state.

## Out of scope

What this flow deliberately does not cover, and which other flow does.

## Open questions

Anything we are unsure about. Tag the person who should answer.

## Diagram

Embed or link the flow diagram (Mermaid, Figma, or whiteboard export).
