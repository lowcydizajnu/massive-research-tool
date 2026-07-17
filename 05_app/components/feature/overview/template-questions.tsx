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
export function TemplateQuestions({
  templateLabel,
  questions,
  answers,
  onAnswer,
  readOnly = false,
}: {
  templateLabel: string;
  questions: OsfQuestion[];
  answers: OsfAnswers;
  onAnswer: (key: string, value: string | string[]) => void;
  readOnly?: boolean;
}) {
  // File questions are out of v1 scope — and they are the only questions whose
  // label ships empty, so rendering them would produce exactly the blank row
  // this component exists to avoid.
  const shown = questions.filter((q) => q.kind !== "file");
  if (!shown.length) return null;

  const answered = shown.filter((q) => {
    const v = answers[q.key];
    return Array.isArray(v) ? v.length > 0 : !!v?.trim();
  }).length;

  return (
    <section aria-labelledby="template-questions-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="template-questions-title"
          className="font-[family-name:var(--font-plex-serif)] text-[length:var(--text-h4)] text-[var(--color-text-primary)]"
        >
          Questions this template asks
        </h3>
        <p aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {answered} of {shown.length} answered
        </p>
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {templateLabel} asks these. Your answers are filed with your preregistration, in your words.
      </p>

      {byPage(shown).map(({ page, questions: qs }) => (
        <div key={page} className="flex flex-col gap-3">
          {page ? (
            <h4 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {page}
            </h4>
          ) : null}
          {qs.map((q) => (
            <Question key={q.key} q={q} value={answers[q.key]} onAnswer={onAnswer} readOnly={readOnly} />
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
  readOnly,
}: {
  q: OsfQuestion;
  value: string | string[] | undefined;
  onAnswer: (key: string, value: string | string[]) => void;
  readOnly: boolean;
}) {
  const id = `osfq-${q.key}`;
  const helpId = q.help ? `${id}-help` : undefined;
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
