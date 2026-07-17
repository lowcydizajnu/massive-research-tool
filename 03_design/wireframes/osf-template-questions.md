# Wireframe spec — Preregistration template questions

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Studies › study › Overview (first stage)](../ia/information-architecture.md)
- **Persona:** [principal-investigator](../../02_product/personas/principal-investigator.md)
- **Status:** ready for handoff

Implements [ADR-0107](../../04_architecture/adrs/0107-osf-template-gate.md) (item ⑨ Phase B). Extends [overview-stage](overview-stage.md); the unanswered-questions warning lands on [preregister-stage](preregister-stage.md). Vocabulary is locked — see [design-rules.md](../../00_meta/rules/design-rules.md).

## Purpose

A researcher picks the preregistration template their field expects, answers its questions in their own words, and files. Until now we offered two templates because we believed both were all-optional. That belief was wrong (ADR-0101 Am. 2) and it was about to veto the template people actually want.

**The thing to hold on to while building this:** OSF will accept anything. A registration with every required question blank returns `201`, gets a DOI, and is published permanently — verified live on the sandbox 2026-07-17, where OSF filled 29 keys with `""` and filed them. Nothing downstream checks. **Every warning in this spec is the only warning that exists.**

---

## Layout

Three surfaces, in this order down the Overview stage: the **template picker** (existing radiogroup, extended), the **Field of study** picker beside it, and a **Questions this template asks** section below both. The unanswered-questions warning renders on Preregister, above the button.

## Content inventory

### 1. The picker

Extends the existing radiogroup on Overview. Five options, in this order:

| Label shown | Questions | Note shown under the label |
| --- | --- | --- |
| **Open-ended** *(default)* | 1 | "A free-form plan. Everything you write is filed as one summary." |
| **OSF preregistration** | 29 | "OSF's standard template. The most widely recognised — and the most detailed." |
| **AsPredicted** | 11 | "Eight short questions. Familiar to most reviewers." |
| **Replication recipe** | 28 | "Structured for replicating an existing finding (Brandt et al., 2014)." |
| **Pre-data-collection (OSF standard)** | 3 | "A short record that you planned before collecting." |

Never render the count as "16 required" in the picker — a bare number reads as a threat before the researcher has seen a single question. Show total questions; requiredness appears per question, in context.

**Switching a template never destroys an answer.** Answers are stored per response key; keys not in the newly-chosen template stay in the snapshot, unrendered, and return if the researcher switches back. Say so, quietly, when switching away from a template with answers: *"Your answers to the other template's questions are kept."*

**Do not** expose `templateKey`, `schema`, `response key`, `schema block`, or "required field" as a bare developer term anywhere on this surface.

---

### 2. "Questions this template asks"

A section below the picker, present only when the chosen template has more than one question (Open-ended has one and already renders as the abstract/summary).

Rendered **from the live schema**, grouped into OSF's own pages, in OSF's own order:

```
Questions this template asks                      3 of 29 answered

  OVERVIEW
  ┌────────────────────────────────────────────────────────┐
  │ Research questions or hypotheses            Needed     │
  │ ┌────────────────────────────────────────────────────┐ │
  │ │                                                    │ │
  │ └────────────────────────────────────────────────────┘ │
  │ Example: Do people rate labelled headlines as less…    │
  └────────────────────────────────────────────────────────┘

  RESEARCH DESIGN
  ┌────────────────────────────────────────────────────────┐
  │ Study design                                Needed     │
  │ ┌────────────────────────────────────────────────────┐ │
  │ │                                                    │ │
  │ └────────────────────────────────────────────────────┘ │
  │ From your design: 2 screens · one group (no           │
  │ conditions) · 1 measure. ⧉ copy                        │
  └────────────────────────────────────────────────────────┘
```

### Labels come from the question-label block. Never the input.

**`display_text` is empty on every input block in the catalogue** (verified live: 1,057 of 1,057). A form that labels an input from the input renders **blank**. Resolve the label from the sibling `question-label` block via `schema_block_group_key` — verified: 29 groups in OSF Preregistration, every one resolving.

> **This is the defect this spec most expects.** A blank-label form passes typecheck, lint, build and every server test — this project has shipped exactly that failure three times. **Open the page before calling it done.** Confirm real labels ("Research questions or hypotheses", "Starting and stopping rules") render — not empty rows.

### Requiredness reads as "Needed", per question

The chip is `Needed`, not "Required" — and it is **never** a lock. There is no disabled input, no red, no asterisk. It is information: OSF expects this one.

### Help and example text are chrome — never values

`help_text` renders as help; `example_text` renders as a **placeholder**. Neither is ever a value in the field. A placeholder that becomes a value is our text published as the researcher's scientific commitment, permanently, under a DOI, with nothing catching it (ADR-0107 D2, ADR-0101 Am. 1).

### Select options are submitted byte-exact

Options come from sibling `select-input-option` blocks. Displayed trimmed; **submitted verbatim**. Verified live: option 7 of `344-4` ends with a trailing space, and enum membership *is* checked at draft-PATCH — a trimmed value is a rejected value.

Options are long — several are full paragraphs of certification text. Render as stacked radio cards with the full text, not a `<select>`. The researcher is signing these.

---

### 3. Design facts as reference — never as an answer

Three of OSF's required questions map suspiciously well onto what Phase A already derives:

| OSF asks | Phase A knows |
| --- | --- |
| Study design (`344-40`) | screens, arms + weights, timings |
| Manipulated variables (`344-58`) | the arms |
| Measured variables (`344-62`) | the measures + their response types |

**We do not fill any of them in.** Under the field, show a muted **"From your design:"** line stating the fact, with a **copy** affordance. The researcher decides whether it answers the question, and writes the answer.

The line is why: the deriver describes what was **built**; OSF's questions ask about **intent**. A derived answer sitting in an intent field is indistinguishable — to every downstream reader, forever — from one a human wrote, and OSF will not catch it. Showing the fact next to the question gives the researcher the benefit without us forging the claim.

If the disclosure toggle (ADR-0106 D5) is on and the researcher copies a design fact into an answer, that is **their** text, written by their hand. The disclosure covers derived *variables*, not this.

---

### 4. `344-4` — the one we must NOT answer for them

**Correction to ADR-0107 D1, found while writing this spec.** D1 claims `344-4` ("Foreknowledge of data or evidence") is already answered by our `assertPlanBeforeData` gate. **It is not, and we must not.**

The option text is a certification: *"No part of the data that will be used for this analysis plan exists, and no part will be generated until after this plan is registered."* That is a claim about **all** data for the analysis plan, anywhere in the world, plus a promise about the future.

Our gate knows exactly one thing: there are **no participant responses in this study, in this app**. The researcher may hold pilot data, archival data, or a collaborator's dataset that our gate cannot see. Auto-selecting option 1 would forge a certification on their behalf that we have no standing to make — the precise over-claiming this feature exists to prevent.

So: `344-4` renders **unanswered**, like every other question. Beneath it, the fact we *can* stand behind:

> *From your study: no responses collected yet in My Research Lab. This question is about all data for your analysis plan, including anything collected elsewhere — only you can answer it.*

---

### 5. What field is this study in? (subjects)

OSF's sandbox **refuses to register without at least one subject** — *"Registration must have at least one subject to be registered"* (verified live 2026-07-17). Production does not enforce this today; our real registrations carry none. The sandbox usually runs ahead (ADR-0107 D8).

A **"Field of study"** picker sits with the template picker. Multi-select, searchable, from OSF's live subject list. One is enough; OSF expands the taxonomy path itself (*Comparative Psychology* → *Social and Behavioral Sciences* → *Psychology*).

Copy: *"OSF files your preregistration under a subject area so others can find it."*

**We never pick a subject for the researcher.** Unanswered means we send none, which is exactly today's behaviour — no regression. If OSF later starts enforcing it, an unanswered subject becomes a named line in the pre-flight warning like any other.

---

## Interactions

### 6. The warning before the irreversible step

On **Preregister**, above the button. The project owner chose **warn-and-proceed** over a hard block (2026-07-17): *the researcher owns their study*. The button stays enabled. There is no override dialog, because there is nothing to override.

That decision puts the entire weight on this warning being **specific**:

```
┌──────────────────────────────────────────────────────────┐
│  6 of OSF's questions are unanswered                      │
│                                                           │
│  OSF will accept your preregistration and mint its DOI    │
│  either way — it does not check. Once filed, it is        │
│  permanent and public, and these will read as blank.      │
│                                                           │
│    · Starting and stopping rules                          │
│    · Sample size                                          │
│    · Inference criteria                                   │
│    · Data inclusion and exclusion                         │
│    · Missing data                                         │
│    · Foreknowledge of data or evidence                    │
│                                                           │
│  [ Answer these ]            Preregister anyway →         │
└──────────────────────────────────────────────────────────┘
```

Rules for this component:

- **Name every question, in OSF's own words.** Never "6 required fields are empty". The researcher cannot act on a count.
- **"Answer these"** returns to Overview, scrolled to the first unanswered question.
- **State the consequence once, factually.** No red, no alarm icon, no "Are you sure?". It is not a scold — it is the one piece of information nobody else will give them.
- **Never nag.** Shown once, at the moment of decision. No toast, no repeat, no second confirm.
- If everything is answered, the component does not render at all.

---

## States

| State | What renders |
| --- | --- |
| Template with 1 question (Open-ended) | No questions section — the existing abstract field is the answer |
| Schema fetch fails | The section renders an inline retry, and Preregister warns it could not check. **Never** silently show "all answered" |
| Viewer (read-only) | Answers visible, inputs disabled, no warning component |
| Frozen version | Answers read-only; the questions section shows what was filed |
| Template switched, answers exist for the old one | Quiet note: answers are kept |
| Draft with no answers at all | Section renders with every question empty; this is normal, not an error state |

---

## Edge cases

- **Schema fetch fails at render.** Inline retry; Preregister says it could not check. Never silently report "all answered" — a false all-clear is worse than no check, because the researcher acts on it.
- **Schema drifts between render and push.** We read blocks live at both ends and filter the payload to keys present in the push-time read (ADR-0107 D3). A key that vanished is dropped rather than 400-ing the filing.
- **An answer exists for a key the template no longer has** (researcher switched templates, or OSF revised the schema). The answer stays in the snapshot, unrendered, and is not emitted. Never delete it.
- **Option string drift.** A stored select answer no longer matching any live option renders as unanswered with its stored text shown beneath: *"Previously: <text> — this option is no longer offered."* Never silently submit a stale value; enum membership is enforced at draft-PATCH.
- **Frozen version viewed after OSF revised the schema.** Show what was filed, from the frozen answers. Never re-render a frozen filing against a newer schema.
- **Zero subjects chosen.** We send none — today's behaviour, no regression. If OSF begins enforcing, it becomes a named line in the warning.
- **A required question is a file-input.** Out of scope for v1; the template is not offered (this is what excludes Registered Report Protocol).

## Accessibility notes

- The picker is a `radiogroup` with `aria-describedby` on each option pointing at its note — matching the existing Overview picker.
- Each question is a labelled field: the resolved `question-label` text **is** the `<label>`, bound by `for`/`id`. Because `display_text` is empty on every input block, a naive implementation produces **unlabelled inputs** — a screen-reader dead end, not merely a visual bug.
- The `Needed` chip must not be conveyed by colour alone; it is text.
- Long select options are radio cards: real `<input type="radio">` in a `fieldset` with a `legend` carrying the question label. The full certification text is the accessible name — do not truncate it for screen readers.
- The warning is not a modal and never traps focus. It is `role="status"` (polite) — it must not interrupt, since the researcher may have chosen to proceed deliberately.
- "Answer these" moves focus to the first unanswered field, not merely the scroll position.
- The answered count ("3 of 29 answered") updates in an `aria-live="polite"` region.

## Open questions

- **Multi-select submittable shape** (array vs delimited string) is **unverified**, and OSF Preregistration has two required multi-selects (`344-17` Study type, `344-32` Blinding). Must be probed on the sandbox before that template ships.
- **File-input questions** (`344-42`, `344-49`, `344-60`, `344-64`, `344-68`, `344-73`) are all optional in this template and are **out of scope** — we render them as a note pointing at the existing Materials-on-OSF path (ADR-0094), not as uploads.
- **Randomization** (`344-44`, optional) will have a real answer once block-order randomization ships (owner: planned scope). Until then it is a question like any other — the researcher answers it or doesn't.

## References

- [ADR-0107](../../04_architecture/adrs/0107-osf-template-gate.md) — the decisions, and the live evidence for all of them
- [ADR-0106](../../04_architecture/adrs/0106-derived-design-facts-and-osf-templates.md) — Phase A; D3 (never auto-fill); D5 (the disclosure toggle)
- [ADR-0101](../../04_architecture/adrs/0101-preregistration-templates-typed-fields.md) — Am. 1 (a fallback never returns system-authored content); Am. 2 (the all-optional premise was false)
- [overview-stage.md](overview-stage.md) — the surface this extends
- [preregister-stage.md](preregister-stage.md) — where the warning lands
