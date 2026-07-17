# QA audit — LOS item ⑨ Phase B: the OSF template gate

**Date:** 2026-07-17
**Scope:** [ADR-0107](../../04_architecture/adrs/0107-osf-template-gate.md) + [`osf-template-questions.md`](../../03_design/wireframes/osf-template-questions.md)
**Result:** Build complete, committed unpushed. Code-only — no migration, no seed.
**Gate:** tsc 0 · lint 0 · **1,153 vitest** · `validate.py` clean (293)

---

## What shipped

Researchers can now file under OSF's own preregistration templates — including **OSF Preregistration**, the flagship, which is the thing the owner actually asked for when they picked option 4. Five templates, its 23 answerable questions rendered live from OSF's schema, a field-of-study picker, and a warning before the irreversible step.

## The finding that reframed the work

I briefed this as "build a required-field gate for OSF's late 400." **There is no late 400.**

Verified in OSF's source myself after a subagent first reported it: `RegistrationResponsesValidator` is constructed in exactly one place (`metaschema.py:186`), exactly one production caller passes the flag (`api/nodes/serializers.py:1643`), both default to `False`, `required_fields=True` appears in **zero** production sites, and the registration-create serializer validates nothing. OSF's own comment says the opposite and is **wrong** — the same failure class as our `"the DOI is minted on approval"`, which was false for six weeks.

Then **observed** on test.osf.io: a registration answering **none** of the 16 required questions returned **201**. And the artifact is worse than blank — OSF materialised all 29 keys as `""` and filed them:

```json
{"220-2":"","220-4":"","220-17":[], … ,"220-86":""}
```

Nothing distinguishes "never answered" from "deliberately empty". **So our check is the only one in the chain.** Whatever we miss, nobody catches, and the artifact is permanent and public.

**The owner chose warn-and-proceed over a hard block** (consistent with the ADR-0106 D5 precedent — *"it is his study"*). I recommended blocking; both sides are recorded in D4. What follows from the choice is that the warning is **load-bearing rather than decorative**, which is why it names every blank question in OSF's own words rather than showing a count.

## Bugs found — and where each was found

| # | Bug | Found by |
| --- | --- | --- |
| 1 | **ADR-0101's premise was false.** Open-Ended's `summary` is `required: true`; our default template has always had a required field, and we're safe only because `registry.osf.ts:523` always fills it. The "all-optional" rule derived from that premise would have **vetoed OSF Preregistration**. | Reading the live catalogue |
| 2 | **D1 of my own ADR was wrong.** `344-4` is not answerable from `assertPlanBeforeData` — the option *certifies* "no data exists **anywhere**", while our gate knows only "no responses in this app". Auto-selecting it would forge a certification. → **D9** | Reading OSF's actual option text while writing the spec |
| 3 | **The picker was a visual no-op — again.** `getTemplateQuestions` read the *saved* template, so choosing one rendered nothing until save. The same defect the owner caught 2026-07-15. | **Opening the page** |
| 4 | **Dangling `htmlFor` on select questions** — the label pointed at an id no element carried, so clicking did nothing and the association was broken for screen readers. | **Querying the DOM** for unresolved `for=` targets |
| 5 | **D8 was inert.** I built the server side (subjects PATCHed onto the draft) with nothing able to *set* `osfSubjectIds`. Dead code with a good docstring. | Noticing before shipping |
| 6 | **My own probe lied.** The first sandbox script printed `=> ADR-0107 is WRONG: OSF does enforce` because it treated *any* 400 as enforcement. The 400 was about subjects. | Reading the error body instead of the verdict |

Bugs 3, 4 and 5 passed typecheck, lint, and 1,151 tests. That is now four times this project has shipped, or nearly shipped, a control that does nothing.

## The second finding — a dated problem for production

The first sandbox attempt failed with *"Registration must have at least one subject to be registered."* Subjects go on the **draft** via `relationships.subjects` (the node endpoint 403s; subjects-at-create 502s).

**Our production registration `5zmfa` has no subjects** — `GET /registrations/5zmfa/subjects/` → `200 []` — and it pushed fine. So production doesn't enforce this and the sandbox does. test.osf.io generally runs ahead, so this looks like it's coming, and on that day **every `pushRegistration` would break**.

Stated honestly: **I did not establish *why* they differ.** A provider-config or sandbox-only setting can't be excluded. "Production will break" is **inference, not observation**. D8 sets subjects regardless — one PATCH, harmless today, bomb defused.

## The wire contract, observed rather than assumed

Three claims were carried as NOT VERIFIED and are now facts (draft-only probe; every artifact deleted, `204`):

| Claim | Result |
| --- | --- |
| Multi-select shape | **Array** of exact strings. `["<opt>"]` → 200; bare string → 400; comma-delimited → 400; `[]` → 200 |
| A trimmed option is rejected | **Yes.** Byte-exact → 200; the *same* option trimmed → **400** |
| An unknown key is a hard 400 | **Yes** — *"Additional properties are not allowed ('77-2' was unexpected)"* |

The second is why "trim for display, never for submission" is a real rule: a UI that tidies whitespace **breaks the filing**, and the tidier the code looks, the more surely it fails.

**Correction to ADR-0107's own risk list:** it warned that a rejection would carry an unhelpful raw message because the friendly-error branch is dead code. For invalid values that's wrong — OSF says *"For your registration, your response to the 'Study type' field is invalid…"*, naming the field in plain language. So we surface OSF's message rather than invent one.

## Verification

Every piece opened in a browser, not just made green:

- **Questions form** — 23 fields, **zero blank labels**, OSF's real text and pages. Typed an answer, picked the stray-whitespace option, ticked a multi-select, saved, reloaded: "3 of 23 answered", all restored. The DB confirms `344-4` kept its trailing space and `344-17` is an array — both would have 400'd OSF otherwise.
- **Warning** — on an un-preregistered study: *"16 of OSF's questions are unanswered"*, all 16 named, deep-link to the first, **button still enabled**. On the already-filed study it correctly doesn't render.
- **Subject picker** — searched "social psych" against the real 1,239-term taxonomy, picked *Social Psychology*, saved; the DB carries `["584240da54be81056cecaab6"]`.

Tests use **real captured `schema_blocks` payloads**, not hand-written mocks — and that immediately caught a false assumption of mine (I asserted all 29 questions have labels; two don't).

## Not verified — stated, not implied

- **No filing has been made with this code.** Every OSF call it makes is separately live-verified, and the payload builders are unit-tested, but `pushRegistration` end-to-end with a template's answers has not been run. Doing so costs a permanent DOI on a real registration.
- **Why sandbox and production differ on subjects** — inference only (see above).
- **File-input questions** are out of v1 and untried; the submittable shape for a file response has never been observed.

## Next

Deploy is a plain code-only push — no migration. Then Zenodo, then item ⑩.
