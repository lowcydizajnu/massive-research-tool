/**
 * Turns OSF's `schema_blocks` into a form we can render (ADR-0107, item ⑨ Phase B).
 *
 * Pure: takes the raw block array, returns questions. The fetch lives in the
 * adapter; this is the part worth testing, and it is tested against REAL block
 * payloads captured from api.osf.io (`__tests__/fixtures/*.blocks.json`) rather
 * than a hand-written mock — a mock would agree with whatever we already believe
 * about OSF, which is exactly how the six-week DOI bug survived.
 *
 * THE THING THAT WILL BITE YOU (ADR-0107 D5): an input block's `display_text` is
 * EMPTY. On every input block, in every schema — 1,057 of 1,057, verified live.
 * The human label lives on a sibling `question-label` block, bound by
 * `schema_block_group_key`. Read the label off the input and every field renders
 * blank, and every input is unlabelled for a screen reader. That defect passes
 * tsc, lint, build and the whole server suite.
 *
 * One genuine exception, found by the fixture rather than assumed: a bare
 * `file-input` can have an EMPTY label block of its own (344-42, 344-60 in OSF
 * Preregistration) because OSF hangs it off the preceding question as an upload
 * slot. Both are optional. Callers must not assume `label` is non-empty for
 * `kind: "file"` — v1 does not render file questions at all.
 */

/** A raw block as OSF serves it. Only the fields we consume. */
export type OsfSchemaBlock = {
  attributes: {
    index?: number | null;
    block_type?: string | null;
    display_text?: string | null;
    help_text?: string | null;
    example_text?: string | null;
    required?: boolean | null;
    registration_response_key?: string | null;
    schema_block_group_key?: string | null;
  };
};

/** How the researcher answers — drives which control renders. */
export type OsfInputKind = "long-text" | "short-text" | "single-select" | "multi-select" | "file" | "contributors" | "unknown";

export type OsfQuestion = {
  /** OSF's response key. The ONLY key we may ever emit (ADR-0107 D3). */
  key: string;
  /** Resolved from the sibling question-label block — never from the input. */
  label: string;
  help: string;
  /** Renders as a placeholder. NEVER as a value (ADR-0107 D2). */
  example: string;
  required: boolean;
  kind: OsfInputKind;
  /** Exact submittable strings. Empty unless kind is a select. */
  options: string[];
  /** OSF's own page heading, for grouping. */
  page: string;
  index: number;
};

const INPUT_KIND: Record<string, OsfInputKind> = {
  "long-text-input": "long-text",
  "short-text-input": "short-text",
  "single-select-input": "single-select",
  "multi-select-input": "multi-select",
  "file-input": "file",
  "contributors-input": "contributors",
};

/** True for blocks that carry a researcher answer (as opposed to presentation). */
function isInput(t: string | null | undefined): boolean {
  return !!t && t in INPUT_KIND;
}

/**
 * Groups blocks into questions, in OSF's own order, under OSF's own page headings.
 *
 * Binding is by `schema_block_group_key`, NOT positional adjacency: options are
 * siblings of their input, and OSF does not guarantee they neighbour it.
 * A block with no group key (page headings, section text) is chrome.
 */
export function readOsfQuestions(blocks: OsfSchemaBlock[]): OsfQuestion[] {
  const ordered = [...blocks].sort((a, b) => (a.attributes.index ?? 0) - (b.attributes.index ?? 0));

  const groups = new Map<string, OsfSchemaBlock[]>();
  for (const b of ordered) {
    const g = b.attributes.schema_block_group_key;
    if (g) groups.set(g, [...(groups.get(g) ?? []), b]);
  }

  const out: OsfQuestion[] = [];
  let page = "";
  const seen = new Set<string>();

  for (const b of ordered) {
    const a = b.attributes;
    if (a.block_type === "page-heading") {
      page = (a.display_text ?? "").trim();
      continue;
    }
    if (!isInput(a.block_type) || !a.registration_response_key) continue;

    const key = a.registration_response_key;
    if (seen.has(key)) continue; // a key appears once; defend anyway
    seen.add(key);

    const group = a.schema_block_group_key ? (groups.get(a.schema_block_group_key) ?? []) : [];
    const labelBlock = group.find((x) => x.attributes.block_type === "question-label");

    out.push({
      key,
      // The label is the question-label's text. Falling back to the input's own
      // display_text would render "" — see the header note.
      label: (labelBlock?.attributes.display_text ?? "").trim(),
      help: (labelBlock?.attributes.help_text ?? a.help_text ?? "").trim(),
      example: (labelBlock?.attributes.example_text ?? a.example_text ?? "").trim(),
      required: a.required === true,
      kind: INPUT_KIND[a.block_type!] ?? "unknown",
      // Byte-exact (ADR-0107 D6): several options in the live catalogue carry
      // stray whitespace, and enum membership IS checked at draft-PATCH, so a
      // trimmed option is a REJECTED option. Trim for display, never here.
      options: group
        .filter((x) => x.attributes.block_type === "select-input-option")
        .map((x) => x.attributes.display_text ?? ""),
      page,
      index: a.index ?? 0,
    });
  }
  return out;
}

/** Questions grouped under OSF's page headings, order preserved. */
export function byPage(questions: OsfQuestion[]): { page: string; questions: OsfQuestion[] }[] {
  const pages: { page: string; questions: OsfQuestion[] }[] = [];
  for (const q of questions) {
    const last = pages[pages.length - 1];
    if (last && last.page === q.page) last.questions.push(q);
    else pages.push({ page: q.page, questions: [q] });
  }
  return pages;
}

/** An answer map keyed by OSF response key. Multi-selects hold arrays. */
export type OsfAnswers = Record<string, string | string[]>;

function isBlank(v: string | string[] | undefined): boolean {
  if (v === undefined) return true;
  return Array.isArray(v) ? v.length === 0 : v.trim() === "";
}

/**
 * The required questions the researcher has not answered.
 *
 * This is the ONLY completeness check that exists anywhere in the chain. OSF
 * enforces nothing — verified live 2026-07-17: a registration with all 16
 * required questions blank returned 201, minted a DOI, and OSF filed 29 keys as
 * `""`. So there is no server-side backstop; whatever this misses, nobody
 * catches, and the artifact is permanent and public.
 *
 * Per the project owner (2026-07-17) this WARNS rather than blocks — the
 * researcher owns their study. That makes the caller's message load-bearing:
 * name every question, in OSF's words. A count is not actionable.
 *
 * `file` questions are excluded: we cannot answer them via registration_responses
 * (v1 does not offer any template with a required file question).
 */
export function unansweredRequired(questions: OsfQuestion[], answers: OsfAnswers): OsfQuestion[] {
  return questions.filter((q) => q.required && q.kind !== "file" && isBlank(answers[q.key]));
}

/**
 * The payload for OSF, filtered to keys present in the LIVE block read.
 *
 * Two rules, both load-bearing:
 * 1. Never emit a key we did not just read (ADR-0107 D3). An unknown key is a
 *    hard 400 — `additionalProperties: False`, unconditional — while a MISSING
 *    key is silence. That asymmetry is the real OSF contract.
 * 2. Never emit a blank. OSF materialises absent keys as `""` itself; sending
 *    our own empties adds nothing and would make "unanswered" indistinguishable
 *    from "deliberately empty" in our own payload too.
 */
export function toRegistrationResponses(questions: OsfQuestion[], answers: OsfAnswers): OsfAnswers {
  const out: OsfAnswers = {};
  for (const q of questions) {
    const v = answers[q.key];
    if (!isBlank(v)) out[q.key] = v!;
  }
  return out;
}
