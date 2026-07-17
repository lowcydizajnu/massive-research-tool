# ADR 0107 — Offer OSF's own preregistration templates, and answer their questions honestly

- **Status:** accepted
- **Date:** 2026-07-17
- **Deciders:** Paweł Rosner
- **Tags:** osf, preregistration, integrity, forms

## Context

Item ⑨ Phase A ([ADR-0106](0106-derived-design-facts-and-osf-templates.md)) derived design facts and disclosed them. Phase B is the half the project owner actually asked for: *"the goal was also to make user able to select templates provided by osf"*.

Today we offer exactly two: Open-Ended and the Replication Recipe. [ADR-0101](0101-preregistration-templates-typed-fields.md) justified that pair on the grounds that **every field in them is optional**, so a partial fill can never 400.

Three facts, all read live from `api.osf.io` on 2026-07-16/17, reframe the work. **Two of them contradict things this repo already asserts in writing.**

**1. The catalogue is 44 schemas, not 14.** 42 are `active`. The roadmap's count and its template names are both wrong. `active` is *not* a proxy for offerable — `Outdated EGAP Registration (DO NOT USE)` is `active: true`.

**2. ADR-0101's premise is false.** Open-Ended's `summary` block is `required: true` (`GET /v2/schemas/registrations/5df83f7dd28338001ac0ab0d/schema_blocks/` → 5 blocks, 1 required). Our *default template has always had a required field*. We never 400'd because `registry.osf.ts:523` unconditionally supplies `summary` via `buildSummary`. The invariant that actually held was never "all-optional" — it was **"every required key has a guaranteed filler or a researcher-facing home."** ADR-0101 needs an amendment; see Consequences.

**3. OSF does not enforce required fields. Anywhere.** This inverts the problem. Verified by reading the source (`develop`, re-verified independently after a subagent first reported it):

- `RegistrationResponsesValidator` is constructed in exactly **one** place: `osf/models/metaschema.py:186`, from `validate_registration_responses(self, registration_responses, required_fields=False)`.
- Exactly **one** production caller passes the flag: `api/nodes/serializers.py:1643`, inside `update_registration_responses(self, draft, registration_responses, required_fields=False)`.
- `required_fields=True` appears in **zero** production call sites.
- The registration-create serializer (`api/registrations/serializers.py`) never validates responses at all.

OSF's own comment at `api/nodes/serializers.py:1631` reads *"Required fields are only required when creating the actual registration, not updating the draft."* **That comment is false.** It documents an intention no code implements — the same failure class as our adapter's *"the DOI is minted on approval"*, which was wrong for six weeks and which the mocks happily agreed with.

So the danger is not a researcher hitting a 400 at the irreversible moment. It is the inverse, and worse: **the registration succeeds, mints a permanent DOI, and publishes a public, immutable preregistration with every required question blank.** There is no server-side backstop. Whatever we do not catch, nobody catches.

What OSF *does* enforce, unconditionally: `additionalProperties: False` (`osf/models/validators.py:363`). An **unknown key is a hard 400**; a **missing required key is silence**. That asymmetry is the real contract.

## Options considered

### Option A — Curated picker only: offer just the zero-required schemas

- Filter to schemas we can complete from typed fields we already hold.
- **Pros:** Zero new form surface. Cannot regress.
- **Cons:** Caps us at the zero-required set, which is almost entirely consortium/lab-locked (Character Lab, Platform, Services, Sample, ASIST). The only general-purpose additions are AsPredicted and OSF-Standard Pre-Data Collection. **It permanently excludes "OSF Preregistration" — the template the owner asked for.** Answers the letter of the request and not the point.

### Option B — Gate at Preregister only

- Offer everything; block the freeze with a checklist of what is missing.
- **Pros:** Simple.
- **Cons:** Blocks without offering anywhere to fix it. Cruel.

### Option C — Map each required field to a new typed `StudyOverview` field

- Grow `PlanFieldKey` per required question.
- **Cons:** `O(schemas × questions)`. OSF Preregistration alone adds 16, Qualitative 13 more under a *different* key convention (`q1`…), Secondary Data 9 more (`72-*`). Each needs a `readOverview` default forever. **And typed fields are the substrate the Phase A deriver populates — routing OSF's intent questions there is the shortest path to violating ADR-0106 D3.**

### Option D — Generic `schema_blocks`-driven form only

- Render OSF's questions; no curation, no gate.
- **Cons:** Would offer Eye-Tracking (30 required, incl. "Calibration points") — preregistering methods the platform cannot run. No protection against the silent-blank failure.

### Option E — Hybrid: curated picker + generic form + completeness warning

- Curate *which* schemas are offered; render their questions generically; warn on blanks before the irreversible step.

## Decision

**We will do Option E: a curated picker over a reviewed subset of the live catalogue, a generic `schema_blocks`-driven form that gives every required question a home the *researcher* fills, and a completeness check that warns — loudly and specifically — but does not block.**

The three parts each solve a different third. The picker decides what we are willing to file at all (a capability judgement — we exclude Eye-Tracking and EEG because we cannot run those methods, not because they are hard). The form gives the researcher somewhere to answer. The check tells them what is still blank before they create something permanent.

### D1 — v1 offers five templates

| Template | id | required | why |
| --- | --- | --- | --- |
| Open-Ended Registration | `5df83f7dd28338001ac0ab0d` | 1 | Ships today; stays the **default** (no existing study may silently change the schema it files under). Its one required key is filler-guaranteed. |
| Replication Recipe (Brandt et al., 2014) | `64b14a08d639e5000d2013a5` | 0 | Ships today. Owns the 5 verified keys. |
| Preregistration Template from AsPredicted.org | `64bab305769023000d0acdc0` | 0 | The highest value per unit of work in the catalogue: domain-neutral, widely recognised, **zero** required. |
| OSF-Standard Pre-Data Collection | `564d31db8c5e4a7c9694b2c0` | 0 | Trivial, domain-neutral. |
| **OSF Preregistration** | `697b72f611a8e98484c6139b` | **16** | **The reason Phase B exists** (owner, 2026-07-17). 13 of 16 are long-text the form handles. ~~`344-4` is already answered by the `assertPlanBeforeData` gate~~ — **struck; see D9.** |

*Why not* van 't Veer Social Psych (19 required) or Secondary Data (9): deferred, not excluded — see Revisit triggers. *Why not* Eye-Tracking/EEG/Qualitative: capability, permanently (ADR-0106). *Why not* Registered Report Protocol (only 4 required): a required **file-input** (`Attach manuscript`), unsatisfiable by a text-only `registration_responses` PATCH. Four other schemas share that blocker.

### D2 — The form never pre-fills an OSF answer

Every required key starts **empty**. `help_text`/`example_text` render as help and placeholder chrome, **never as a value**. This is ADR-0101 Amendment 1 generalised: *a fallback must never return content the system authored*. A prefilled OSF answer is our guidance text published as the researcher's scientific commitment, permanently, under a DOI — and per Context fact 3, OSF will not catch it.

*Why not* prefill from the Phase A deriver where the mapping looks obvious (design facts → `344-40` "Study design"): the deriver describes what was **built**; OSF's required questions ask for **intent**. That is exactly ADR-0106's line — *OSF cannot read your design; we cannot read your intent*. A derived answer sitting in an intent field is indistinguishable, to every downstream reader, from one a human wrote.

### D3 — Only keys read live from `schema_blocks` may be emitted

Fetched server-side at render, re-read at push, payload filtered to keys present in that read. No key hardcoded for a new template; no key inferred from another schema. Key conventions are provably non-uniform (`344-2`, `q1`, `72-2`, `77-2`, `item1`, `summary`), so any pattern-guess is wrong — and an unknown key is a hard 400 (`additionalProperties: False`).

*Why not* freeze the block set into `definition_snapshot` (ADR-0002 self-describing snapshots): OSF revises schemas in place (OSF Preregistration is at `schema_version` 4) and option strings are the exact submittable values, so a stale frozen option would 400 or, worse, file a wrong value. We record `schemaId` + `schemaVersion` in the snapshot for **drift detection**, and read blocks **live**.

### D4 — The completeness check warns; it does not block. *(Project-owner decision, 2026-07-17.)*

Surfaced on the Preregister pre-flight, naming each unanswered question **by its human label**, immediately before the irreversible step. The researcher may file anyway.

Recorded honestly: **I recommended a hard block and the owner chose warn-and-proceed.** The reasoning for the owner's call is consistent with the precedent they set on the ADR-0106 D5 disclosure toggle — *"at the end of the day it is his study"* — and it is their product. The reasoning against is that this is the one gate with no server-side backstop, and the artifact is permanent, public and uncorrectable.

What follows from the choice: **the warning's quality is now load-bearing, not decorative.** It is the only thing between a researcher and a hollow permanent DOI. It must name each blank question in the researcher's language, at the moment of decision — never a generic banner. This is still a large improvement on today, where nothing tells anyone anything is blank.

### D5 — Labels come from the question-label block, never the input block

`display_text` is **empty on every input block in the catalogue**. A form that renders an input's label from the input renders **blank**. Labels resolve from the preceding `question-label` block via `schema_block_group_key`.

This is the single most likely way this ships looking broken, and it is precisely the class of defect this project has shipped three times (a control passing tsc + lint + build + 1,000 tests while doing nothing). **The wireframe must mandate opening the page.**

### D6 — Select options are submitted byte-exact

Option strings come from the sibling `select-input-option` block's `display_text`, bound by `schema_block_group_key` (not positional adjacency). **Trim for display only, never for submission** — 8 options across the catalogue carry stray whitespace, 3 of them inside OSF Preregistration itself. Enum membership *is* validated at draft-PATCH even with `required_fields=False` (`validators.py:390-396`), so a trimmed value is a rejected value.

*Why not* use `attributes.schema.blocks` from the list response and save a round trip: it is **empty for 10 of 44 schemas** — including Open-Ended (0 vs 5 real blocks) — and lacks `index` and `schema_block_group_key`. Only `/schema_blocks/` is authoritative.

### D7 — Consolidate the OSF binding into the in-repo registry

Each `PREREG_TEMPLATES` entry gains `schemaName`, `schemaId`, `schemaVersion` and its key map; the boolean `isRecipe` dispatch becomes an N-way lookup. The binding is currently split across three files, none of them the registry. Catalogue stays **in-repo TS/Zod, never a DB table** (ADR-0101 — dodges the `db:seed:prod` invisibility trap).

Selection stays **by name** at push time (`filter[name]` 400s; `resolveSchemaId` matches client-side), and the match stays **exact** — `Character Lab Registration` vs `Character Lab Registration ` (trailing space) collide under any normalising match.

## Consequences

**Easier.** Researchers can file under OSF's real templates, including the flagship. Adding a template becomes a registry entry plus a curation judgement, not a code change per field.

**Harder.** We now own a schema-driven form — a genuinely new concept in this codebase. Live block reads add a network dependency to the Overview render.

**Committed to.** Reading blocks live at render and push; emitting only live-read keys; never authoring an answer; a curated allowlist maintained by hand.

**Precluded from.** Auto-filling any OSF question. Offering methods the platform cannot run.

**Consequential correction — ADR-0101 needs Amendment 2.** Its stated rationale ("both templates are all-optional") is factually wrong: Open-Ended's `summary` is required. The rule that actually held is the filler-or-home guarantee. Left uncorrected, the next person to reason from ADR-0101 reasons from a false premise.

**Prerequisite, tracked separately.** Phase B lands on a failure path that already orphans a fresh private OSF node per failed attempt (`existingNodeId` is only read from a version whose push *succeeded*), which Inngest retries. Phase B introduces the first templates that can plausibly fail. That path needs fixing alongside.

## Revisit triggers

- **COS wires up `required_fields=True`.** The branch is fully implemented and unit-tested (`osf_tests/test_schemas.py`), just unwired — a one-line change would turn today's silent success into a hard 400 at DOI-minting time, carrying the raw `'344-2' is a required property` message, because the friendly-error branch is unreachable dead code. Our design is correct under both regimes, which is why D4 builds the check regardless.
- The sandbox probe on **test.osf.io** contradicts the source reading (see References — this is source-traced, not yet observed).
- A schema we offer changes `schema_version` and our recorded version no longer matches.
- Researchers ask for secondary-data or Registered Report workflows (the latter needs a file-input response shape we have never observed).
- Multi-select submittable shape (array vs delimited string) is observed — **unverified today**, and OSF Preregistration has two required multi-selects (`344-17`, `344-32`).

## References

- [ADR-0101](0101-preregistration-templates-typed-fields.md) — typed fields, in-repo registry, never invent a key. **Premise corrected here.**
- [ADR-0106](0106-derived-design-facts-and-osf-templates.md) — Phase A; D3 (never auto-fill prose); D6 (Phase B scope).
- [ADR-0102](0102-claim-binding-and-the-ratchet.md) — the ratchet.
- Live reads, 2026-07-16/17: `GET /v2/schemas/registrations/` (44, 42 active) and `/schema_blocks/` per schema.
- OSF source (`develop`), verified 2026-07-17: `osf/models/metaschema.py:182-187`; `api/nodes/serializers.py:1630-1647`; `osf/models/validators.py:304-311,361-367,390-396`.
- [`06_qa/audit-logs/2026-07-17-auto-derived-design-facts-phase-a.md`](../../06_qa/audit-logs/2026-07-17-auto-derived-design-facts-phase-a.md) — the draft-stage seam this design relies on, proven live.
- **OBSERVED on test.osf.io, 2026-07-17** — the source trace is now confirmed by experiment. See the Postscript below.


---

## Postscript (2026-07-17) — the claim is now observed, and the probe found a second thing

The Context above traced "OSF does not enforce required fields" from source. It has now been **run** on `test.osf.io`, against the sandbox's own OSF Preregistration (`69d3d9a47249f92f8ed34d74`, 87 blocks, **16 required**).

Method: create project → create draft bound to that schema → PATCH `registration_responses: {}` (answering *nothing*) → `POST /nodes/{id}/registrations/`.

**Result: `201`. Accepted.** The claim holds.

And the artifact is worse than "blank". OSF did not merely tolerate the omission — it **materialised every required key with an empty value** and filed them:

```json
{"220-2":"","220-4":"","220-14":"","220-17":[],"220-27":[],"220-32":[], … ,"220-86":""}
```

Twenty-nine keys, every one of them empty, registered as the researcher's scientific commitments. There is no 400 to catch, no warning, and nothing in the artifact that marks it as unanswered rather than deliberately-left-empty. **D4's premise is confirmed: our check is the only one that exists.** (The owner's warn-and-proceed call stands; this is exactly why the warning has to be specific.)

### The second finding — a ticking problem for production

The first attempt failed at the registration POST with:

> `Registration must have at least one subject to be registered`

Not a required-field error — OSF's **subject taxonomy** requirement, which we had never observed. It is satisfied by PATCHing `relationships.subjects` onto the **draft** (`200`; OSF then auto-expands the taxonomy path — *Comparative Psychology* became *Comparative Psychology / Social and Behavioral Sciences / Psychology*). Not on the node: `PATCH /nodes/{id}/subjects/` → `403`, and subjects-at-node-create → `502`.

**Our production registrations have no subjects at all.** `GET /v2/registrations/5zmfa/subjects/` → `200 []`, on a registration that pushed successfully. So production does **not** currently enforce this, and the sandbox does.

test.osf.io generally runs ahead of production. The most likely reading is that **the subject requirement is coming to production**, and on the day it ships **every `pushRegistration` breaks** — `registry.osf.ts` sets no subjects anywhere. That is a silent, dated bomb under the shipped OSF integration, unrelated to Phase B but discovered by it.

Stated honestly: I have **not** established *why* the two differ. Alternatives I cannot exclude — a provider-level config difference, or a sandbox-only setting. The conclusion "prod will break when this ships" is **inference, not observation**.

**Consequent decision — D8:** Phase B sets subjects on the draft as part of the push, for every template. It is one PATCH, it is required by the sandbox today, it is harmless on production now, and it removes the bomb. The researcher-facing question ("what field is this study in?") needs a home in the picker — spec'd in the wireframe. Absent a researcher answer we do **not** invent a subject: no subject is the status quo, and inventing one would be authoring content the researcher didn't write (D2).

### Residue

Four sandbox project nodes deleted (`204` each). One sandbox registration (`zc97j`) remains — pending approval, not public, no DOI minted at observation time. Sandbox artifacts are disposable and it is not on the production registry.

*Also worth recording as method:* the first probe printed `=> ADR-0107 is WRONG: OSF does enforce` — because the script treated **any** 400 as enforcement. The 400 was about subjects. Had that verdict been believed, this ADR would have been reversed on a false reading of its own test. **A probe's own conclusion is an assertion to be checked, not a result.**


---

## D9 (2026-07-17) — `344-4` must NOT be auto-answered. D1 was wrong.

Found while writing the wireframe, by reading the option text OSF actually ships.

D1 claimed `344-4` ("Foreknowledge of data or evidence") was free — that our `assertPlanBeforeData` gate already knows the answer, so the gate's fact could fill OSF's required field without authoring anything. **That is wrong, and shipping it would have forged a certification.**

The option is not a status. It is a signed claim:

> *"Data does not yet exist. No part of the data that will be used for this analysis plan exists, and no part will be generated until after this plan is registered."*

That asserts something about **all data for the analysis plan, anywhere**, plus a promise about the future. Our gate establishes exactly one fact: **no participant responses exist in this study, in this app.** It cannot see pilot data on the researcher's laptop, archival data, or a collaborator's dataset. The two are not the same claim, and the gap between them is the whole point of the question — OSF asks it precisely to catch data the reader cannot otherwise know about.

Auto-selecting option 1 would publish, permanently and under a DOI, a certification the researcher never made and that we have no standing to make. It is the same error as D2's prefilled answer, wearing the costume of a machine-true fact. And per the Postscript, OSF would accept it without a murmur.

**Decision:** `344-4` renders unanswered like every other question. We display the fact we *can* stand behind — "no responses collected yet in My Research Lab" — next to it, and state plainly that the question covers data collected elsewhere too. The researcher certifies.

**The general rule this yields**, and the one to apply to the next "obvious" mapping: *a fact we can prove about our own system is not the same claim as the question OSF is asking. Check the scope of the claim before treating a derived fact as an answer.* D1's other mappings (`344-40` study design, `344-58` manipulated variables, `344-62` measured variables) fail the same test for the same reason and are handled as reference-not-answer in the wireframe.
