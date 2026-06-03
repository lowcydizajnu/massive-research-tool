import type { RuntimeBlock } from "@/server/runtime/participant";

/**
 * Participant-facing render of a block (participant-runtime.md). Server
 * component — the likert input is native radios inside the page's form, so no
 * client JS is needed. Distinct from the researcher Builder's block rendering
 * (ADR-0013: participant UI doesn't reuse researcher chrome).
 */
export function BlockView({ block, seed }: { block: RuntimeBlock; seed?: string }) {
  if (block.key === "social-post") return <SocialPostView config={block.config} />;
  if (block.key === "likert-7") return <Likert7Input config={block.config} />;
  if (block.key === "multiple-choice")
    return <MultipleChoiceInput config={block.config} seed={seed} />;
  if (block.key === "free-text") return <FreeTextInput config={block.config} />;
  if (block.key === "slider") return <SliderInput config={block.config} />;
  if (block.key === "ranking") return <RankingInput config={block.config} />;
  if (block.key === "attention-check") return <AttentionCheckInput config={block.config} />;
  if (block.key === "demographics") return <DemographicsInput config={block.config} />;
  // Unknown module — render nothing rather than crash the runtime.
  return (
    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      (This question type isn’t available.)
    </p>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Participant-deterministic shuffle (seeded by the response id) so the same
 *  participant sees the same order on resume. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function SocialPostView({ config }: { config: Record<string, unknown> }) {
  const headline = str(config.headline);
  const body = str(config.body);
  const source = str(config.source);
  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4">
      {source ? (
        <div className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          {source}
        </div>
      ) : null}
      {headline ? (
        <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          {headline}
        </h2>
      ) : null}
      {body ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{body}</p>
      ) : null}
    </article>
  );
}

function Likert7Input({ config }: { config: Record<string, unknown> }) {
  const prompt = str(config.prompt);
  const left = str(config.leftAnchor) || "Strongly disagree";
  const right = str(config.rightAnchor) || "Strongly agree";
  const points = [1, 2, 3, 4, 5, 6, 7];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </legend>
      <div className="flex items-end justify-between gap-2">
        {points.map((n) => (
          <label
            key={n}
            className="flex flex-1 cursor-pointer flex-col items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
          >
            <input
              type="radio"
              name="value"
              value={n}
              aria-label={`${n} of 7${n === 1 ? ` — ${left}` : n === 7 ? ` — ${right}` : ""}`}
              className="size-4 accent-[var(--color-primary)]"
            />
            <span aria-hidden>{n}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </fieldset>
  );
}

function MultipleChoiceInput({
  config,
  seed,
}: {
  config: Record<string, unknown>;
  seed?: string;
}) {
  const prompt = str(config.prompt);
  const multiple = config.multiple === true;
  const raw = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  const options = config.randomizeOrder === true && seed ? seededShuffle(raw, seed) : raw;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </legend>
      {options.map((opt, i) => (
        <label
          key={`${i}-${opt}`}
          className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
        >
          <input
            type={multiple ? "checkbox" : "radio"}
            name="mc"
            value={opt}
            className="size-4 accent-[var(--color-primary)]"
          />
          <span>{opt}</span>
        </label>
      ))}
    </fieldset>
  );
}

function FreeTextInput({ config }: { config: Record<string, unknown> }) {
  const prompt = str(config.prompt);
  const longForm = config.longForm === true;
  const maxLength = typeof config.maxLength === "number" ? config.maxLength : undefined;
  const cls =
    "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="ft"
        className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
      >
        {prompt}
      </label>
      {longForm ? (
        <textarea id="ft" name="text" rows={5} maxLength={maxLength} className={cls} />
      ) : (
        <input id="ft" type="text" name="text" maxLength={maxLength} className={cls} />
      )}
    </div>
  );
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function SliderInput({ config }: { config: Record<string, unknown> }) {
  const prompt = str(config.prompt);
  const min = num(config.min, 0);
  const max = num(config.max, 100);
  const step = num(config.step, 1);
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="sl"
        className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
      >
        {prompt}
      </label>
      <input
        id="sl"
        type="range"
        name="value"
        min={min}
        max={max}
        step={step}
        defaultValue={Math.round((min + max) / 2)}
        className="w-full accent-[var(--color-primary)]"
      />
      <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function RankingInput({ config }: { config: Record<string, unknown> }) {
  const prompt = str(config.prompt);
  const items = Array.isArray(config.items) ? (config.items as unknown[]).map(str) : [];
  const positions = items.map((_, i) => i + 1);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </legend>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Assign a rank to each item (1 = highest).
      </p>
      {items.map((item, i) => (
        <div key={`${i}-${item}`} className="flex items-center justify-between gap-2">
          <input type="hidden" name={`item_${i}`} value={item} />
          <span className="min-w-0 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
            {item}
          </span>
          <select
            name={`rank_${i}`}
            aria-label={`Rank for ${item}`}
            defaultValue={i + 1}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)]"
          >
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      ))}
    </fieldset>
  );
}

function AttentionCheckInput({ config }: { config: Record<string, unknown> }) {
  const prompt = str(config.prompt);
  const options = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </legend>
      {options.map((opt, i) => (
        <label
          key={`${i}-${opt}`}
          className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
        >
          <input type="radio" name="value" value={opt} className="size-4 accent-[var(--color-primary)]" />
          <span>{opt}</span>
        </label>
      ))}
    </fieldset>
  );
}

function DemographicsInput({ config }: { config: Record<string, unknown> }) {
  const cls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
  const genderOptions = [
    "Woman",
    "Man",
    "Non-binary",
    "Prefer to self-describe",
    "Prefer not to say",
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        About you
      </div>
      {config.askAge !== false ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Age</span>
          <input type="number" name="age" min={0} max={120} className={cls} />
        </label>
      ) : null}
      {config.askGender !== false ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Gender</span>
          <select name="gender" defaultValue="" className={cls}>
            <option value="">Select…</option>
            {genderOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {config.askCountry !== false ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Country of residence
          </span>
          <input type="text" name="country" autoComplete="country-name" className={cls} />
        </label>
      ) : null}
    </div>
  );
}
