import { ReactionTimeInput } from "@/components/feature/take/reaction-time-input";
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
  // V1.12 C1 — embedded content (stimulus-only).
  if (block.key === "text") return <TextView config={block.config} />;
  if (block.key === "image") return <ImageView config={block.config} />;
  if (block.key === "video") return <VideoView config={block.config} />;
  if (block.key === "link") return <LinkView config={block.config} />;
  // V1.12 C2 — standard form blocks.
  if (block.key === "email") return <SimpleFieldInput config={block.config} type="email" />;
  if (block.key === "url") return <SimpleFieldInput config={block.config} type="url" />;
  if (block.key === "number") return <NumberInput config={block.config} />;
  if (block.key === "date") return <SimpleFieldInput config={block.config} type="date" />;
  if (block.key === "yes-no") return <YesNoInput config={block.config} />;
  if (block.key === "dropdown") return <DropdownInput config={block.config} />;
  if (block.key === "phone") return <SimpleFieldInput config={block.config} type="tel" />;
  if (block.key === "address") return <AddressInput config={block.config} />;
  if (block.key === "contact") return <ContactInput config={block.config} />;
  if (block.key === "picture-choice") return <PictureChoiceInput config={block.config} />;
  // V1.12 Wave 3 — numeric research scales.
  if (block.key === "nps") return <NpsInput config={block.config} />;
  if (block.key === "rating-stars") return <StarRatingInput config={block.config} />;
  if (block.key === "vas") return <VasInput config={block.config} />;
  if (block.key === "matrix-grid") return <MatrixGridInput config={block.config} />;
  if (block.key === "semantic-differential") return <SemanticDifferentialInput config={block.config} />;
  if (block.key === "reaction-time") return <ReactionTimeInput config={block.config} />;
  if (block.key === "maxdiff") return <MaxDiffInput config={block.config} />;
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

/* ---------- V1.12 C1: embedded content (stimulus-only) ---------- */

function TextView({ config }: { config: Record<string, unknown> }) {
  const md = str(config.contentMd);
  if (!md.trim()) return null;
  return (
    <div className="flex flex-col gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
      {md.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

function ImageView({ config }: { config: Record<string, unknown> }) {
  const url = str(config.url);
  const caption = str(config.caption);
  if (!url) return null;
  return (
    <figure className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- researcher-supplied arbitrary URL; next/image needs configured domains */}
      <img
        src={url}
        alt={str(config.alt)}
        className="max-h-[480px] w-full rounded-[var(--radius-md)] object-contain"
      />
      {caption ? (
        <figcaption className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Resolve a YouTube/Vimeo URL to its embed URL; null = treat as a direct file. */
function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function VideoView({ config }: { config: Record<string, unknown> }) {
  const url = str(config.url);
  const caption = str(config.caption);
  if (!url) return null;
  const embed = embedUrl(url);
  return (
    <figure className="flex flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-md)] bg-black">
        {embed ? (
          <iframe
            src={embed}
            title={caption || "Embedded video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- researcher stimulus; captions optional
          <video src={url} controls className="h-full w-full" />
        )}
      </div>
      {caption ? (
        <figcaption className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function LinkView({ config }: { config: Record<string, unknown> }) {
  const url = str(config.url);
  const title = str(config.title);
  const description = str(config.description);
  if (!url) return null;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4 hover:bg-[var(--color-surface-subtle)]"
    >
      <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {title || url}
      </span>
      {description ? (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {description}
        </span>
      ) : null}
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{host}</span>
    </a>
  );
}

/* ---------- V1.12 C2: standard form blocks ---------- */

const FIELD_CLS =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
const PROMPT_CLS =
  "text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]";

/** email / url / date — a single typed text field named "value". */
function SimpleFieldInput({
  config,
  type,
}: {
  config: Record<string, unknown>;
  type: "email" | "url" | "date" | "tel";
}) {
  const placeholder =
    type === "email" ? "name@example.com" : type === "url" ? "https://…" : type === "tel" ? "+1 555 123 4567" : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="value" className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <input
        id="value"
        type={type}
        name="value"
        placeholder={placeholder}
        required={config.required === true}
        className={FIELD_CLS}
      />
    </div>
  );
}

function NumberInput({ config }: { config: Record<string, unknown> }) {
  const unit = str(config.unit);
  const min = typeof config.min === "number" ? config.min : undefined;
  const max = typeof config.max === "number" ? config.max : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="value" className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <div className="flex items-center gap-2">
        <input id="value" type="number" name="value" min={min} max={max} required={config.required === true} className={FIELD_CLS} />
        {unit ? (
          <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function YesNoInput({ config }: { config: Record<string, unknown> }) {
  const yes = str(config.yesLabel) || "Yes";
  const no = str(config.noLabel) || "No";
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <div className="flex gap-2">
        {[
          { v: "yes", label: yes },
          { v: "no", label: no },
        ].map((o) => (
          <label
            key={o.v}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-3 text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <input type="radio" name="value" value={o.v} required={config.required === true} className="size-4 accent-[var(--color-primary)]" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DropdownInput({ config }: { config: Record<string, unknown> }) {
  const options = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="value" className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <select id="value" name="value" defaultValue="" required={config.required === true} className={FIELD_CLS}>
        <option value="" disabled>
          Choose…
        </option>
        {options.map((opt, i) => (
          <option key={`${i}-${opt}`} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- V1.12 C2 batch 2: phone (above) / address / contact / picture-choice ---------- */

function AddressInput({ config }: { config: Record<string, unknown> }) {
  const fields: { name: string; label: string; autoComplete: string }[] = [
    { name: "street", label: "Street address", autoComplete: "street-address" },
    { name: "city", label: "City", autoComplete: "address-level2" },
    { name: "state", label: "State / region", autoComplete: "address-level1" },
    { name: "postal", label: "Postal code", autoComplete: "postal-code" },
    { name: "country", label: "Country", autoComplete: "country-name" },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
          <input type="text" name={f.name} autoComplete={f.autoComplete} className={FIELD_CLS} />
        </label>
      ))}
    </fieldset>
  );
}

function ContactInput({ config }: { config: Record<string, unknown> }) {
  const fields: { name: string; label: string; type: string; autoComplete: string }[] = [
    { name: "name", label: "Name", type: "text", autoComplete: "name" },
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel" },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
          <input type={f.type} name={f.name} autoComplete={f.autoComplete} className={FIELD_CLS} />
        </label>
      ))}
    </fieldset>
  );
}

function PictureChoiceInput({ config }: { config: Record<string, unknown> }) {
  const multiple = config.multiple === true;
  const urls = (Array.isArray(config.imageUrls) ? (config.imageUrls as unknown[]).map(str) : []).filter(
    (u) => u.trim() !== "",
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, i) => (
          <label
            key={`${i}-${url}`}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2 hover:bg-[var(--color-surface-subtle)] has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-subtle)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- researcher-supplied URL */}
            <img src={url} alt={`Option ${i + 1}`} className="h-28 w-full rounded-[var(--radius-sm)] object-cover" />
            <input
              type={multiple ? "checkbox" : "radio"}
              name="mc"
              value={url}
              className="size-4 accent-[var(--color-primary)]"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------- V1.12 Wave 3: numeric research scales ---------- */

function NpsInput({ config }: { config: Record<string, unknown> }) {
  const left = str(config.leftLabel) || "Not at all likely";
  const right = str(config.rightLabel) || "Extremely likely";
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <label
            key={n}
            className="flex flex-1 min-w-[36px] cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)] has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-subtle)]"
          >
            <input
              type="radio"
              name="value"
              value={n}
              required={config.required === true}
              aria-label={`${n}${n === 0 ? ` — ${left}` : n === 10 ? ` — ${right}` : ""}`}
              className="sr-only"
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

function StarRatingInput({ config }: { config: Record<string, unknown> }) {
  const max = typeof config.max === "number" ? config.max : 5;
  // Radios in reverse so a CSS sibling hover/checked highlights stars up to N.
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          const v = i + 1;
          return (
            <label key={v} className="cursor-pointer text-[length:var(--text-display)] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-warning-text-on-subtle)] has-[:checked]:text-[var(--color-warning-text-on-subtle)]">
              <input
                type="radio"
                name="value"
                value={v}
                required={config.required === true}
                aria-label={`${v} of ${max} stars`}
                className="sr-only"
              />
              <span aria-hidden>★</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function VasInput({ config }: { config: Record<string, unknown> }) {
  const min = num(config.min, 0);
  const max = num(config.max, 100);
  const left = str(config.leftLabel);
  const right = str(config.rightLabel);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="value" className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <input
        id="value"
        type="range"
        name="value"
        min={min}
        max={max}
        step="any"
        defaultValue={(min + max) / 2}
        className="w-full accent-[var(--color-primary)]"
      />
      <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span>{left || String(min)}</span>
        <span>{right || String(max)}</span>
      </div>
    </div>
  );
}

/* ---------- V1.12 Wave 3: composite scales ---------- */

function MatrixGridInput({ config }: { config: Record<string, unknown> }) {
  const rows = Array.isArray(config.rows) ? (config.rows as unknown[]).map(str) : [];
  const columns = Array.isArray(config.columns) ? (config.columns as unknown[]).map(str) : [];
  const required = config.required === true;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[length:var(--text-small)]">
          <thead>
            <tr>
              <th />
              {columns.map((c, j) => (
                <th key={j} className="px-2 py-1 text-center font-medium text-[var(--color-text-secondary)]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--color-border-subtle)]">
                <td className="py-2 pr-3 text-[var(--color-text-primary)]">{row}</td>
                {columns.map((c, j) => (
                  <td key={j} className="px-2 py-2 text-center">
                    <input
                      type="radio"
                      name={`row_${i}`}
                      value={c}
                      required={required}
                      aria-label={`${row}: ${c}`}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function SemanticDifferentialInput({ config }: { config: Record<string, unknown> }) {
  const left = Array.isArray(config.leftLabels) ? (config.leftLabels as unknown[]).map(str) : [];
  const right = Array.isArray(config.rightLabels) ? (config.rightLabels as unknown[]).map(str) : [];
  const points = typeof config.points === "number" ? config.points : 7;
  const pairs = Math.min(left.length, right.length);
  const required = config.required === true;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <input type="hidden" name="rowCount" value={pairs} />
      {Array.from({ length: pairs }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-right text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {left[i]}
          </span>
          <div className="flex flex-1 justify-between">
            {Array.from({ length: points }, (_, p) => (
              <label key={p} className="cursor-pointer">
                <input
                  type="radio"
                  name={`row_${i}`}
                  value={p + 1}
                  required={required}
                  aria-label={`${left[i]} to ${right[i]}: ${p + 1} of ${points}`}
                  className="size-4 accent-[var(--color-primary)]"
                />
              </label>
            ))}
          </div>
          <span className="w-24 shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {right[i]}
          </span>
        </div>
      ))}
    </fieldset>
  );
}

/* ---------- V1.12 Wave 3: MaxDiff (best–worst) ---------- */

function MaxDiffInput({ config }: { config: Record<string, unknown> }) {
  const items = Array.isArray(config.items) ? (config.items as unknown[]).map(str) : [];
  const required = config.required === true;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={PROMPT_CLS}>{str(config.prompt)}</legend>
      <table className="w-full border-collapse text-[length:var(--text-small)]">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-[var(--color-text-secondary)]">Best</th>
            <th className="px-2 py-1 text-left font-medium text-[var(--color-text-secondary)]">Worst</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-[var(--color-border-subtle)]">
              <td className="px-2 py-2 text-center">
                <input type="radio" name="best" value={item} required={required} aria-label={`Best: ${item}`} className="size-4 accent-[var(--color-primary)]" />
              </td>
              <td className="px-2 py-2 text-center">
                <input type="radio" name="worst" value={item} required={required} aria-label={`Worst: ${item}`} className="size-4 accent-[var(--color-primary)]" />
              </td>
              <td className="py-2 pl-3 text-[var(--color-text-primary)]">{item}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
