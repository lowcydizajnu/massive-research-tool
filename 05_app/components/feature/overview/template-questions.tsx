"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { byPage, isAnswered, isListQuestion, isReversibleListQuestion, type OsfAnswers, type OsfQuestion } from "@/server/modules/osf-schema";
import { HelpModal } from "@/components/ui/help-modal";
import { cn } from "@/lib/utils";

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
export type PrefillFor = (q: OsfQuestion) => { from: string; text: string; items?: string[] } | null;

export function TemplateQuestions({
  heading,
  intro,
  questions,
  filter,
  answers,
  onAnswer,
  prefillFor,
  onUpdateOrigin,
  defaultCollapsed,
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
  onUpdateOrigin?: (q: OsfQuestion, items: string[]) => void;
  /** Collapsed by default — used for the Optional section, so the page opens
   *  scannable and the researcher expands what they need. */
  defaultCollapsed?: boolean;
  readOnly?: boolean;
}) {
  // File questions are out of v1 scope — and they are the only questions whose
  // label ships empty, so rendering them would produce exactly the blank row
  // this component exists to avoid.
  const shown = questions.filter(
    (q) => q.kind !== "file" && (filter === undefined || (filter === "required") === q.required),
  );
  if (!shown.length) return null;

  // Same definition of "has content" the completeness gate uses (isAnswered =
  // !isBlank), so the counter and the readiness check never disagree on e.g. [""].
  const answered = shown.filter((q) => isAnswered(answers[q.key])).length;

  return (
    <SectionShell heading={heading} intro={intro} counter={`${answered} of ${shown.length} answered`} defaultCollapsed={defaultCollapsed}>
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
              onUpdateOrigin={onUpdateOrigin}
              readOnly={readOnly}
            />
          ))}
        </div>
      ))}
    </SectionShell>
  );
}

/**
 * A big, scannable, collapsible section header (owner 2026-07-17: "use bigger
 * headers… they might be also expandable/collapsable"). Native <details> so it
 * works without JS and stays accessible. Exported so the editor wraps its own
 * plan sections in the same shell — one section chrome across the page.
 */
export function SectionShell({
  heading,
  intro,
  counter,
  info,
  defaultCollapsed = false,
  children,
}: {
  heading: string;
  intro?: string;
  counter?: string;
  /** Optional explainer, revealed as a modal by the "?" affordance in the header. */
  info?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  // React state, not a bare `<details open>` prop: passing `open={bool}` makes it
  // CONTROLLED, so any re-render (a keystroke, a template switch) slams the section
  // back to its default and collapses one the researcher just opened. State +
  // conditional children — the same pattern the Builder groups use — preserves it.
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <section className="flex flex-col gap-5 border-t border-[var(--color-border-subtle)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Chevron + title = one toggle, matching Builder groups
              (builder-workspace / variants-section). */}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            {open ? (
              <ChevronDown className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            ) : (
              <ChevronRight className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            )}
            <span className="font-[family-name:var(--font-plex-serif)] text-[length:var(--text-h3)] text-[var(--color-text-primary)]">
              {heading}
            </span>
          </button>
          {/* Help = the same modal the Variants section uses (owner 2026-07-17:
              the "?" must open a modal, not a dead native tooltip). */}
          {info ? <HelpModal title={heading} label={`About ${heading}`}>{info}</HelpModal> : null}
        </div>
        {counter ? (
          <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {counter}
          </span>
        ) : null}
      </div>
      {open ? (
        <>
          {intro ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{intro}</p>
          ) : null}
          {children}
        </>
      ) : null}
    </section>
  );
}

/**
 * OSF's per-question help is often a full paragraph (owner 2026-07-17: "display
 * less text by default and expand with 'show more'"). Clamp it to two lines and
 * offer the toggle ONLY when the text actually overflows — measured, not guessed
 * from a character count, so a two-line help never grows a dead "Show more".
 */
function HelpText({ id, text }: { id?: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clampable, setClampable] = useState(false);

  // Measure once, in the collapsed state, before the browser paints — so the
  // toggle is present on first paint if needed and never flickers in. The
  // clamped <p> reports clientHeight = 2 lines while scrollHeight is the full
  // content; a real overflow is the only thing that earns a "Show more".
  useEffect(() => {
    const el = ref.current;
    if (el) setClampable(el.scrollHeight - el.clientHeight > 4);
  }, [text]);

  return (
    <div className="flex flex-col gap-0.5">
      <p
        id={id}
        ref={ref}
        className={cn(
          "text-[length:var(--text-small)] text-[var(--color-text-muted)]",
          !expanded && "line-clamp-2",
        )}
      >
        {text}
      </p>
      {clampable ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

/** A stored answer shown in a plain text box. Normally a string; a `string[]`
 *  can reach a prose control only if the question stopped classifying as
 *  list-shaped (an OSF label revision) — show its combined text, not a blank box
 *  that hides a stored answer and reads as empty (sync audit 2026-07-17). Mirrors
 *  the string→list coercion `listValue` does for the opposite direction. */
function answerAsText(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((l) => (typeof l === "string" ? l.trim() : ""))
      .filter(Boolean)
      .map((l, i) => `${i + 1}. ${l}`)
      .join("\n");
  }
  return "";
}

function Question({
  q,
  value,
  onAnswer,
  prefill,
  onUpdateOrigin,
  readOnly,
}: {
  q: OsfQuestion;
  value: string | string[] | undefined;
  onAnswer: (key: string, value: string | string[]) => void;
  /** Text from the researcher's own plan that relates to this question, or null. */
  prefill: { from: string; text: string; items?: string[] } | null;
  /** Push this list answer back to the plan field it mirrors (owner 2026-07-17).
   *  Only wired for list questions, where the copy is list→list and safe. */
  onUpdateOrigin?: (q: OsfQuestion, items: string[]) => void;
  readOnly: boolean;
}) {
  const id = `osfq-${q.key}`;
  const helpId = q.help ? `${id}-help` : undefined;
  // A list-shaped question (hypotheses) is edited as entries and combined into
  // OSF's one text field at push — so prefill and update-origin are clean
  // list↔list copies, never a text→structure parse (owner 2026-07-17).
  const asList = isListQuestion(q);
  // Normally the stored value IS an array for a list question. A plain string can
  // only appear if this question was answered as free text before it became
  // list-shaped — carry it in as a single entry rather than dropping it.
  const listValue = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  // Prefill is only meaningful for a text answer — you cannot draft a select.
  const isText = q.kind === "long-text" || q.kind === "short-text";
  const currentText = typeof value === "string" ? value : "";
  const showPrefill = !readOnly && isText && !asList && prefill && prefill.text !== currentText;
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
      {q.help ? <HelpText id={helpId} text={q.help} /> : null}

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

      {asList ? (
        <ListQuestion
          q={q}
          items={listValue}
          onChange={(items) => onAnswer(q.key, items)}
          prefill={prefill?.items ? { from: prefill.from, items: prefill.items } : null}
          // Update-origin only where the plan home is itself a flat list
          // (hypotheses). Variables' plan home is structured, so a flat push-back
          // would flatten it — prefill-only there (osf-schema D11 addendum).
          onUpdateOrigin={onUpdateOrigin && isReversibleListQuestion(q) ? (items) => onUpdateOrigin(q, items) : undefined}
          readOnly={readOnly}
        />
      ) : q.kind === "single-select" || q.kind === "multi-select" ? (
        <SelectQuestion q={q} id={id} value={value} onAnswer={onAnswer} readOnly={readOnly} helpId={helpId} />
      ) : q.kind === "short-text" ? (
        <input
          id={id}
          type="text"
          aria-describedby={helpId}
          disabled={readOnly}
          value={answerAsText(value)}
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
          value={answerAsText(value)}
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
  id,
  value,
  onAnswer,
  readOnly,
  helpId,
}: {
  q: OsfQuestion;
  /** Matches the text inputs' id so the Preregister "Answer these" deep-link
   *  (#osfq-<key>) resolves for selects too. Without it the jump silently
   *  no-ops on exactly the question most likely to be blank — the foreknowledge
   *  certification, which is a select and cannot be prefilled. */
  id: string;
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
    // tabIndex -1 so the anchor jump can FOCUS it, not just scroll (the notice's
    // stated intent). scroll-mt keeps it clear of the sticky top bar.
    <fieldset id={id} tabIndex={-1} aria-describedby={helpId} className="flex scroll-mt-4 flex-col gap-1.5 outline-none">
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

/**
 * A list-of-entries editor for an OSF question the researcher's own plan already
 * holds as a list — hypotheses (owner 2026-07-17). Same shape as the plan's
 * Hypotheses editor, so the two read alike. Stored as string[]; combined into
 * OSF's single text field only at push (osf-schema.toRegistrationResponses).
 *
 * Because both this and the plan field are lists, prefill and update-origin are
 * clean copies — no text→structure parsing, so nothing can be silently mangled.
 */
function ListQuestion({
  q,
  items,
  onChange,
  prefill,
  onUpdateOrigin,
  readOnly,
}: {
  q: OsfQuestion;
  items: string[];
  onChange: (items: string[]) => void;
  prefill: { from: string; items: string[] } | null;
  onUpdateOrigin?: (items: string[]) => void;
  readOnly: boolean;
}) {
  const rows = items.length ? items : [""];
  const set = (i: number, v: string) => onChange(rows.map((x, j) => (j === i ? v : x)));
  const add = () => onChange([...rows, ""]);
  const removeAt = (i: number) => onChange(rows.filter((_, j) => j !== i).length ? rows.filter((_, j) => j !== i) : []);

  const filled = items.filter((x) => x.trim());
  // Hypotheses number as H1, H2…; other lists (variables) as a plain 1., 2.
  const rowLabel = (i: number) => (isReversibleListQuestion(q) ? `H${i + 1}` : `${i + 1}.`);
  // Offer prefill only when it would actually change something.
  const showPrefill = !readOnly && prefill && JSON.stringify(prefill.items) !== JSON.stringify(filled);
  // Offer update-origin only once the answer diverges from — and isn't empty vs —
  // its origin; both are lists, so this is a plain copy back.
  const showUpdateOrigin =
    !readOnly && onUpdateOrigin && filled.length > 0 && (!prefill || JSON.stringify(prefill.items) !== JSON.stringify(filled));

  return (
    <div className="flex flex-col gap-2">
      {showPrefill ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] p-2 text-[length:var(--text-small)]">
          <span className="text-[var(--color-text-muted)]">From {prefill!.from} ({prefill!.items.length})</span>
          <button
            type="button"
            onClick={() => onChange(prefill!.items)}
            className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Use these &amp; edit
          </button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="pt-2 font-mono text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
              {rowLabel(i)}
            </span>
            <textarea
              rows={2}
              disabled={readOnly}
              value={row}
              placeholder={i === 0 ? q.example : ""}
              onChange={(e) => set(i, e.target.value)}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-primary)]"
            />
            {!readOnly ? (
              <button
                type="button"
                aria-label={`Remove entry ${i + 1}`}
                onClick={() => removeAt(i)}
                className="mt-1.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={add}
            className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            + Add
          </button>
          {showUpdateOrigin ? (
            <button
              type="button"
              onClick={() => onUpdateOrigin!(filled)}
              className="self-start rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline hover:bg-[var(--color-surface-subtle)]"
            >
              Update your plan to match
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
