# Experiment spec — {Experiment name}

A user-facing experiment in the app, distinct from a research protocol (the protocol is the science; the experiment is the configured instance the user builds with our tool).

- **Owner:** {researcher / org}
- **Based on protocol:** {link to research protocol in 01_research/protocols/}
- **Status:** draft | piloting | live | archived
- **Visibility:** private | shared | public

## Summary

One paragraph for the participant-facing description.

## Configuration

- **Duration estimate:** N minutes.
- **Device requirements:** desktop, mobile, both.
- **Browser/input requirements:** mouse, keyboard, touch, microphone, camera.
- **Language(s):** …

## Structure

The high-level structure of the experiment in our system's terms:

1. Block: {name} — {n} trials, condition {C}.
2. Block: {name} — …

If built as a node graph, link the graph definition file.

## Nodes used

For each node type in the experiment:

- **{Node type}** — its role here, parameters used.

This list helps verify all required node types exist in the system before the experiment is run.

## Stimuli and assets

Inventory of stimuli (text, images, audio, video) with sources and licenses.

## Measures captured

What data is recorded per trial, per block, per participant.

## Data export

Format (CSV, JSON, BIDS-like), variables included, anonymization applied.

## Pilot results

Once piloted: sample size, completion rate, dropout points, surprises.

## Review log

Each review of this experiment (researcher review, ethics review, technical review) recorded with date, reviewer, outcome.
