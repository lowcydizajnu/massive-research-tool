# Wireframe spec — Linked outputs (OSF resources)

- **Serves user flow:** [Finish a study and publish its record](../../02_product/user-flows/finish-a-study-and-publish-its-record.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Study · Record (composer) and Study · Preregister, beside the existing Materials-on-OSF panel
- **Persona:** [Hanna — postdoc operator](../../02_product/personas/postdoc-operator.md) (the one who links); [Sofia — burned replicator](../../02_product/personas/burned-replicator.md) (the one who benefits — she sees the badges on the registration)
- **Status:** ready for handoff

## Purpose

Let a researcher make the outputs of their study **citable from their OSF registration** — without leaving the app, and without claiming anything that isn't true.

## Layout

A panel in the owner-only column, directly **below** the existing "Materials on OSF" panel, in both places that panel renders (`preregister/page.tsx`, `record-composer.tsx`). Same card treatment, same width. It is never on the public record — like Materials, its query is a `writeProcedure`.

Zones, top to bottom:

1. **Header** — "Linked outputs" + one line of purpose.
2. **Gate strip** (conditional) — the reason the panel can't act yet, if any. Replaces the body.
3. **Slot list** — five rows, one per OSF resource type.
4. **Footer** — the external-DOI escape hatch, collapsed by default.

## Content inventory

- **Panel title** — static: "Linked outputs".
- **Panel purpose** — static, one line: "Make your data, code, materials and paper citable from your OSF registration." Researcher-native; never says "resource" or "artifact" (ADR-0103 D8).
- **Slot row × 5** — one per type. Each carries:
  - **Label** — static, from the Vocabulary map: **Data · Analysis code · Materials · Paper · Supplements**. (The internal wire values `data` / `analytic_code` / `materials` / `papers` / `supplements` never appear on screen.)
  - **State chip** — computed. See States.
  - **DOI** — from server (`osf_resource_link.pid`), shown as the bare DOI, monospace, linking to `https://doi.org/{pid}`.
  - **Source line** — computed, one short sentence saying *why* this DOI is here. This is the honesty line; see Interactions.
  - **Action** — varies by slot and state.
- **Gate reason** (conditional) — from server. Exactly one of: not connected to OSF / no registration yet / registration has no DOI yet / not admin on the OSF node.
- **External DOI field** (collapsed) — a DOI input + type select, per the owner's steer: *"for sure for public record we can have custom fields for external doi if someone want to add them"*. Optional, never required, never the first thing you see.
- **Consent dialog copy** — static; see Interactions → Make citable.

## The five slots — what each can actually do

This table is the spec's core; it is what stops the panel implying capability it lacks.

| Slot | Automatic source | If absent |
|---|---|---|
| **Paper** | `study_record.articleDoi` — the researcher already pasted it | prompt links to the Abstract section, where that DOI lives |
| **Materials** | mint the DOI of the OSF **project** we already upload to (ADR-0103 Amendment 1) | offer "Make citable" if materials are uploaded; otherwise point at the Materials panel above |
| **Data** | mint the DOI of the OSF **component** holding the published dataset (ADR-0105 D3) | offer "Make citable" if `dataPublished`; otherwise say the dataset isn't published yet and link to the Data section |
| **Analysis code** | *none — we host no code with a DOI* | external DOI only |
| **Supplements** | *none* | external DOI only |

**Analysis code and Supplements have no automatic path, and the panel must say so plainly** rather than render an inert control. Copy: "No automatic source — paste a DOI if you deposited this somewhere." This is the lesson from item ⑤'s dead picker and item ⑥'s dead chip: a control that cannot act is worse than no control.

## States

Mirror the Materials panel's vocabulary exactly (`osf-materials-panel.tsx`: Uploaded / Failed / Skipped / Not uploaded) so the two cards read as one system. Do not invent a parallel set.

- **Default (not linked)** — chip: **Not linked**, `--color-surface-subtle` / `--color-text-muted`, matching Materials' "Not uploaded". Action per the table above.
- **Linking** — chip: **Linking…**, `role="status"`. Covers the whole POST → PATCH → finalize sequence (ADR-0103 D3); it is one action to the researcher even though it is three calls.
- **Linked** — chip: **Linked**, `--color-primary-subtle`, matching Materials' "Uploaded". Shows the DOI + source line. Action: **Remove**.
- **Failed** — chip: **Failed** + the reason, plus **Try again**. A resource that exists but was never finalized shows **Failed**, not Linked — an unfinalized resource shows no badge on OSF, so calling it Linked would be a lie (ADR-0103 D3).
- **Empty (whole panel)** — all five Not linked: the panel still renders, with the purpose line. Not an error; the starting state.
- **Gated (whole panel)** — body replaced by one reason:
  - not connected → "Connect OSF in Settings · Connections to link outputs." (mirror the Materials panel's existing link)
  - not preregistered → "Link outputs once this study is preregistered."
  - preregistered but no DOI yet → "This registration's DOI hasn't reached us yet. Outputs can be linked once it does." (ADR-0103 D4 — a predictable state, named, rather than a 409 surfaced as an error). Copy states the fact, not a cause: verified live 2026-07-16 that OSF mints the DOI at registration time, so this state is now the rare tail (a failed identifier read awaiting the `runOsfWatch` backfill), not the norm — blaming OSF's minting would be a guess, and usually a wrong one.
  - not admin on the node → "Only an admin of the OSF project can link outputs."
- **Loading** — skeleton rows; not a spinner in place of the panel.

## Interactions

- **"Make citable"** (Materials / Data slots) — the consented mint. Opens a dialog stating **both** permanent consequences before the click (ADR-0104 D3, ADR-0105 D5):
  > **This makes your OSF {project|component} public** — anyone will be able to see it.
  > **The DOI can't be removed.** OSF mints it permanently, and neither we nor you can take it back.
  > OSF will mint the DOI and we'll link it to your registration.

  Confirm / Cancel. Never a default, never a side-effect of an upload. Cancel is the safe path and takes focus first.
- **Data slot, when the published dataset carries a participant ID** — refused, per ADR-0105 D2. The copy names the column and the fix: "Your published dataset includes the participant ID column. Remove it from the Data section before depositing — once a DOI exists, it can't be withdrawn." This is the one place the product refuses rather than warns; the copy must explain *why*, not just say no.
- **"Remove"** — for a **finalized** resource this is a soft delete that OSF logs publicly on the registration (ADR-0103 D5). Say so before the click: "This is recorded on your registration's public history." Removing the link does **not** remove the DOI or make the OSF node private (ADR-0105 D6) — the dialog must not imply it does.
- **External DOI (footer)** — expand → paste a DOI + pick a type → **Link**. Normalise a pasted `https://doi.org/…` to the bare DOI (OSF does this server-side; mirror it so the field shows what will actually be stored). Errors surface OSF's own reasons: an invalid DOI, or a DOI already used for that type.
- **DOI link** — opens `https://doi.org/{pid}` in a new tab.

**The source line is not decoration.** Each linked slot says where its DOI came from — "Minted for your OSF project", "Minted for the dataset component", "From the article DOI on your record", "Added by you". A reader should never have to guess whether we made a claim or the researcher did. Same principle as ADR-0102's referent line.

## Edge cases

- **A very long DOI** — DOIs have no length limit; truncate the middle, never the suffix (the suffix is the discriminating part). Full value in `title` + copy-to-clipboard.
- **The project is already public** — drop the "makes it public" clause from the consent dialog; state only the DOI permanence. Don't warn about a thing that already happened.
- **The project already has a DOI** — OSF rejects a second mint (`"A DOI already exists for this resource."`). Treat as success: read the existing DOI and link it. Don't surface an error for a state that is exactly what we wanted (ADR-0103 D7 reconciliation).
- **Not OSF-admin on the node** — minting requires admin. Gate with that reason; don't let them click into a 403.
- **The node must be PUBLIC to mint, and OSF's refusal does not say so.** A private node returns a bare `403 "You do not have permission to perform this action."` (verified live 2026-07-16 as ADMIN on the node). Never surface that message — it names neither the cause nor the fix. `mintNodeDoi` publishes first, which is what the consent already promises; the gate must never let a click reach a mint that hasn't been consented to.

## The `data` slot (item ⑧)

`data` is not like the other four. It **accumulates**: each deposit is its own component, its own DOI, its own row (ADR-0105 am. 1 D7). So:

- The row's control is **Deposit to OSF**, then **Deposit again** once one exists — never *Remove*. "Remove the data DOI" names nothing when there are three, and removing the resource wouldn't retract the DOI anyway (D6).
- Below the slots, list **every** deposit with its ordinal, DOI, N, and date. The sequence is the transparency; never collapse it to the latest.
- The re-deposit consent leads with the delta — *"This is deposit 2. N went 200 → 400 since deposit 1 on 3 June"* — then shows the frozen `samplingPlan` **verbatim** and asks the researcher to note a deviation if it departs from the plan. We never parse an N out of that prose, and we never write the Deviations entry for them (D9).
- The gate ladder mirrors `depositDataset`'s refusals in the same order, so the panel never offers a button the mutation would reject: nothing published → PID present → no OSF project → deposit.
- The PID refusal is stated as a consequence, not a scolding: the column *"can identify participants"*, and *"A DOI can't be withdrawn, so this can't be deposited until you remove it."*
- **The registration is withdrawn** — the panel is read-only. Linking outputs to a withdrawn registration is meaningless.
- **Slow / failed mid-sequence** — a POST that succeeded with a PATCH that didn't leaves an unfinalized draft on OSF. Reconcile against the remote list on retry rather than POSTing again (ADR-0103 D7), or the researcher accumulates invisible empty drafts.
- **Many** — five slots is the cap; the enum has exactly five public values. No pagination, ever.

## Accessibility notes

- Each slot row is an `<li>` in a labelled list; the chip is text, not colour alone — the Failed/Linked distinction must survive greyscale, the same rule the Materials chips follow.
- The consent dialog traps focus, is labelled by its heading, and **focuses Cancel first**: the confirm is irreversible, so the safe action gets the default.
- `Linking…` is `role="status"` so it is announced; `Failed` is `role="alert"`.
- The DOI is selectable text, not an icon-only link.

## Open questions

- **Component naming for the dataset** — what do we call the OSF component we create (ADR-0105 D3)? "{Study title} — data" is the obvious default, but it appears on the researcher's own OSF account, so it should probably be editable before the first deposit. Resolve before the build.
- **Re-deposit after new responses** — a dataset DOI points at a component whose files we could update. Does a re-publish overwrite the component (same DOI, new content — silently changing what a citation resolves to), or create a second one? A real versioning question, and ADR-0105 does not answer it. **Blocking for the Data slot; the Materials slot is unaffected.**
