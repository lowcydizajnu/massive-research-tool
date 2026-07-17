"use client";

import { byPage, type OsfAnswers, type OsfQuestion } from "@/server/modules/osf-schema";

/**
 * "Questions this template asks" — item ⑨ Phase B (ADR-0107, wireframe
 * osf-template-questions).
 *
 * OSF's own questions, rendered from the LIVE schema, in OSF's order, under
 * OSF's page headings. The researcher answers them. We never answer for them:
 * `help` is help and `example` is a placeholder — neither is ever a value
 * (D2). A prefilled answer is our text published as their scientific
 * commitment, permanently, under a DOI, and OSF will not catch it.
 *
 * Nothing here blocks. The project owner chose warn-and-proceed (2026-07-17):
 * the researcher owns their study. `Needed` is information, not a lock — no
 * disabled input, no red, no asterisk.
 */
/**
 * Text the researcher's OWN plan holds that relates to an OSF question, offered
 * as a starting draft (ADR-0107 D10). Returns null where nothing relates, or
 * where the scopes differ (the D9 forgery risk — never offered on foreknowledge).
 */
export type PrefillFor = (q: OsfQuestion) => { from: string; text: string } | null;

export function TemplateQuestions({
  heading,
  intro,
  questions,
  filter,
  answers,
  onAnswer,
  prefillFor,
  readOnly = false,
}: {
  heading: string;
  intro?: string;
  questions: OsfQuestion[];
  /** Which subset of the template's questions to show — required vs optional
   *  are separate sections per owner direction (2026-07-17). */
  filter?: "required" | "optional";
  answers: OsfAnswers;
  onAnswer: (key: string, value: string | string[]) => void;
  prefillFor?: PrefillFor;
  readOnly?: boolean;
}) {
  // File questions are out of v1 scope — and they are the only questions whose
  // label ships empty, so rendering them would produce exactly the blank row
  // this component exists to avoid.
  const shown = questions.filter(
    (q) => q.kind !== "file" && (filter === undefined || (filter === "required") === q.required),
  );
  if (!shown.length) return null;

  const titleId = `tq-${heading.replace(/\W+/g, "-").toLowerCase()}`;
  const answered = shown.filter((q) => {
    const v = answers[q.key];
    return Array.isArray(v) ? v.length > 0 : !!v?.trim();
  }).length;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id={titleId}
          className="font-[family-name:var(--font-plex-serif)] text-[length:var(--text-h4)] text-[var(--color-text-primary)]"
        >
          {heading}
        </h3>
        <p aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {answered} of {shown.length} answered
        </p>
      </div>
      {intro ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{intro}</p>
      ) : null}

      {byPage(shown).map(({ page, questions: qs }) => (
        <div key={page} className="flex flex-col gap-3">
          {page ? (
            <h4 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {page}
            </h4>
          ) : null}
          {qs.map((q) => (
            <Question
              key={q.key}
              q={q}
              value={answers[q.key]}
              onAnswer={onAnswer}
              prefill={prefillFor?.(q) ?? null}
              readOnly={readOnly}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function Question({
  q,
  value,
  onAnswer,
  prefill,
  readOnly,
}: {
  q: OsfQuestion;
  value: string | string[] | undefined;
  onAnswer: (key: string, value: string | string[]) => void;
  /** Text from the researcher's own plan that relates to this question, or null. */
  prefill: { from: string; text: string } | null;
  readOnly: boolean;
}) {
  const id = `osfq-${q.key}`;
  const helpId = q.help ? `${id}-help` : undefined;
  // Prefill is only meaningful for a text answer — you cannot draft a select.
  const isText = q.kind === "long-text" || q.kind === "short-text";
  const currentText = typeof value === "string" ? value : "";
  const showPrefill = !readOnly && isText && prefill && prefill.text !== currentText;
  // A select renders as a fieldset of radio/checkbox cards, so there is no ONE
  // element to point `htmlFor` at — its accessible name comes from the
  // fieldset's <legend>. Emitting a label here anyway produced a `for` pointing
  // at a nonexistent id: clicking it did nothing and the association was broken
  // for screen readers. Found by querying the DOM, not by reading the code.
  const isGroup = q.kind === "single-select" || q.kind === "multi-select";
  const Heading = isGroup ? "span" : "label";

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* The label comes from the question-label block (osf-schema.ts). An
            input block's own display_text is EMPTY — labelling from it renders
            a blank row AND an unlabelled input for a screen reader. */}
        <Heading
          {...(isGroup ? {} : { htmlFor: id })}
          className="font-medium text-[var(--color-text-primary)]"
        >
          {q.label}
        </Heading>
        {q.required ? (
          <span className="whitespace-nowrap text-[length:var(--text-small)] text-[var(--color-text-muted)]">Needed</span>
        ) : null}
      </div>
      {q.help ? (
        <p id={helpId} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {q.help}
        </p>
      ) : null}

      {/* Researcher-invoked prefill (ADR-0107 D10). Shows the related text from
          THEIR OWN plan and offers to drop it into the editable answer as a
          starting draft — never automatically, never a value they didn't invoke,
          and never on a scope-mismatch question (prefillFor returns null there).
          They review and edit before it means anything. */}
      {showPrefill ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] p-2 text-[length:var(--text-small)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--color-text-muted)]">From {prefill!.from}:</span>
            <button
              type="button"
              onClick={() => onAnswer(q.key, prefill!.text)}
              className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Use this &amp; edit
            </button>
          </div>
          <p className="line-clamp-3 whitespace-pre-line text-[var(--color-text-secondary)]">{prefill!.text}</p>
        </div>
      ) : null}

      {q.kind === "single-select" || q.kind === "multi-select" ? (
        <SelectQuestion q={q} value={value} onAnswer={onAnswer} readOnly={readOnly} helpId={helpId} />
      ) : q.kind === "short-text" ? (
        <input
          id={id}
          type="text"
          aria-describedby={helpId}
          disabled={readOnly}
          value={typeof value === "string" ? value : ""}
          placeholder={q.example}
          onChange={(e) => onAnswer(q.key, e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)]"
        />
      ) : (
        <textarea
          id={id}
          rows={4}
          aria-describedby={helpId}
          disabled={readOnly}
          value={typeof value === "string" ? value : ""}
          // The example is a PLACEHOLDER. It must never become the value.
          placeholder={q.example}
          onChange={(e) => onAnswer(q.key, e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)]"
        />
      )}
    </div>
  );
}

/**
 * Options are long — several are full paragraphs of certification text — so they
 * render as stacked radio/checkbox cards carrying the FULL text. The researcher
 * is signing these; a truncated `<select>` would hide what they are agreeing to.
 *
 * The option string is the submittable value and goes back BYTE-EXACT. Observed
 * 2026-07-17: the same option trimmed is rejected with a 400. So display trims,
 * state never does.
 */
function SelectQuestion({
  q,
  value,
  onAnswer,
  readOnly,
  helpId,
}: {
  q: OsfQuestion;
  value: string | string[] | undefined;
  onAnswer: (key: string, value: string | string[]) => void;
  readOnly: boolean;
  helpId: string | undefined;
}) {
  const multi = q.kind === "multi-select";
  const selected: string[] = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string" && value
      ? [value]
      : [];

  return (
    <fieldset aria-describedby={helpId} className="flex flex-col gap-1.5">
      <legend className="sr-only">{q.label}</legend>
      {q.options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <label
            key={opt}
            className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-2.5 text-[length:var(--text-small)] hover:bg-[var(--color-surface-subtle)]"
          >
            <input
              type={multi ? "checkbox" : "radio"}
              name={`osfq-${q.key}`}
              disabled={readOnly}
              checked={on}
              onChange={() => {
                // `opt` is passed through untouched — never .trim().
                if (!multi) onAnswer(q.key, opt);
                else onAnswer(q.key, on ? selected.filter((s) => s !== opt) : [...selected, opt]);
              }}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            {/* Trim for DISPLAY only. The stored value keeps its whitespace. */}
            <span className="text-[var(--color-text-secondary)]">{opt.trim()}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
