import { ReactionTimeInput } from "@/components/feature/take/reaction-time-input";
import { getBlockOverride } from "@/components/feature/take/block-overrides";
import { ReactionButton, ReactionGroup } from "@/components/feature/take/reaction-toggles";
import { AudioRecordInput } from "@/components/feature/take/audio-record-input";
import { DrillDownInput } from "@/components/feature/take/drill-down-input";
import { TimedExposureInput } from "@/components/feature/take/timed-exposure-input";
import { ForcedWaitInput } from "@/components/feature/take/forced-wait-input";
import { HeatMapInput } from "@/components/feature/take/heat-map-input";
import { HotSpotInput } from "@/components/feature/take/hot-spot-input";
import { GraphicSliderInput } from "@/components/feature/take/graphic-slider-input";
import { SignatureInput } from "@/components/feature/take/signature-input";
import { FileUploadInput } from "@/components/feature/take/file-upload-input";
import { VideoRecordInput } from "@/components/feature/take/video-record-input";
import { AiChatInput } from "@/components/feature/take/ai-chat-input";
import { ChatWindowPreview } from "@/components/feature/take/chat-window-preview";
import type { ChatAppearance } from "@/lib/themes/themes";
import type { RuntimeBlock } from "@/server/runtime/participant";

/**
 * Participant-facing render of a block (participant-runtime.md). Server
 * component — inputs are native, inside the page's form, so no client JS is
 * needed (except reaction-time). On a multi-block group screen (ADR-0028) every
 * input is namespaced with `namePrefix` (e.g. `${instanceId}__`) so fields from
 * different blocks never collide; single-block screens pass "" → unchanged.
 */
export function BlockView({
  block,
  seed,
  namePrefix = "",
  presetKey,
  responseId,
  chat,
}: {
  block: RuntimeBlock;
  seed?: string;
  namePrefix?: string;
  /** Active theme preset (ADR-0024) — mimicking presets may override a block's renderer. */
  presetKey?: string;
  /** The live response id — needed by interactive server-mediated blocks (ai-chat). */
  responseId?: string;
  /** Chat-window appearance (ADR-0065) for the AI block. */
  chat?: ChatAppearance;
}) {
  const c = block.config;
  const np = namePrefix;
  if (block.key === "ai-chat") {
    // Live chat needs a recorded response + the workspace's AI key, so it only
    // runs in the real take flow. In preview / no-session, render the styled
    // chat window with a disabled composer (ADR-0065), not the live chat.
    if (responseId) {
      return <AiChatInput config={c} responseId={responseId} blockInstanceId={block.instanceId} np={np} chat={chat} />;
    }
    const opening = typeof c.openingMessage === "string" ? c.openingMessage.trim() : "";
    return (
      <ChatWindowPreview
        chat={chat}
        openingMessage={opening}
        note="Live AI conversation — participants chat with the AI here. The preview doesn’t connect to the model."
      />
    );
  }
  // v1 social-post blocks don't record interactions — render them inert.
  const interactive = block.key !== "social-post" || block.version !== "1.0.0";
  const Override = getBlockOverride(presetKey, block.key);
  if (Override) return <>{Override({ config: c, np, interactive })}</>;
  if (block.key === "social-post") return <SocialPostView config={c} np={np} interactive={interactive} />;
  if (block.key === "likert-7") return <Likert7Input config={c} np={np} />;
  if (block.key === "multiple-choice") return <MultipleChoiceInput config={c} seed={seed} np={np} />;
  if (block.key === "free-text") return <FreeTextInput config={c} np={np} />;
  if (block.key === "slider") return <SliderInput config={c} np={np} />;
  if (block.key === "ranking") return <RankingInput config={c} np={np} />;
  if (block.key === "attention-check") return <AttentionCheckInput config={c} np={np} />;
  if (block.key === "demographics") return <DemographicsInput config={c} np={np} />;
  // V1.12 C1 — embedded content (stimulus-only; no inputs → no prefix).
  if (block.key === "text") return <TextView config={c} />;
  if (block.key === "image") return <ImageView config={c} />;
  if (block.key === "video") return <VideoView config={c} />;
  if (block.key === "link") return <LinkView config={c} />;
  // V1.12 C2 — standard form blocks.
  if (block.key === "email") return <SimpleFieldInput config={c} type="email" np={np} />;
  if (block.key === "url") return <SimpleFieldInput config={c} type="url" np={np} />;
  if (block.key === "number") return <NumberInput config={c} np={np} />;
  if (block.key === "date") return <SimpleFieldInput config={c} type="date" np={np} />;
  if (block.key === "yes-no") return <YesNoInput config={c} np={np} />;
  if (block.key === "dropdown") return <DropdownInput config={c} np={np} />;
  if (block.key === "phone") return <SimpleFieldInput config={c} type="tel" np={np} />;
  if (block.key === "address") return <AddressInput config={c} np={np} />;
  if (block.key === "field-group") return <FieldGroupInput config={c} np={np} />;
  if (block.key === "contact") return <ContactInput config={c} np={np} />;
  if (block.key === "picture-choice") return <PictureChoiceInput config={c} np={np} />;
  // V1.12 Wave 3 — research scales.
  if (block.key === "nps") return <NpsInput config={c} np={np} />;
  if (block.key === "rating-stars") return <StarRatingInput config={c} np={np} />;
  if (block.key === "vas") return <VasInput config={c} np={np} />;
  if (block.key === "matrix-grid") return <MatrixGridInput config={c} np={np} />;
  if (block.key === "semantic-differential") return <SemanticDifferentialInput config={c} np={np} />;
  if (block.key === "reaction-time") return <ReactionTimeInput config={c} namePrefix={np} />;
  if (block.key === "audio-record") return <AudioRecordInput config={c} namePrefix={np} responseId={seed ?? ""} />;
  if (block.key === "maxdiff") return <MaxDiffInput config={c} np={np} />;
  if (block.key === "accuracy-confidence") return <AccuracyConfidenceInput config={c} np={np} />;
  if (block.key === "share-intention") return <ShareIntentionInput config={c} np={np} />;
  if (block.key === "constant-sum") return <ConstantSumInput config={c} np={np} />;
  if (block.key === "drill-down") return <DrillDownInput config={c} np={np} />;
  if (block.key === "side-by-side") return <SideBySideInput config={c} np={np} />;
  if (block.key === "timed-exposure") return <TimedExposureInput config={c} np={np} />;
  if (block.key === "forced-wait") return <ForcedWaitInput config={c} np={np} />;
  if (block.key === "heat-map") return <HeatMapInput config={c} np={np} />;
  if (block.key === "hot-spot") return <HotSpotInput config={c} np={np} />;
  if (block.key === "graphic-slider") return <GraphicSliderInput config={c} np={np} />;
  if (block.key === "signature") return <SignatureInput config={c} np={np} responseId={seed ?? ""} />;
  if (block.key === "file-upload") return <FileUploadInput config={c} np={np} responseId={seed ?? ""} />;
  if (block.key === "video-record") return <VideoRecordInput config={c} np={np} responseId={seed ?? ""} />;
  if (block.key === "embedded-data" || block.key === "end-redirect")
    return (
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {block.key === "embedded-data"
          ? "Captures URL parameters into the response — not shown to participants."
          : "Shows a return-to-panel button on the completion page — not a study screen."}
      </p>
    );
  return (
    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      (This question type isn’t available.)
    </p>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
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

const FIELD_CLS =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
const PROMPT_CLS =
  "font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]";

function SocialPostView({
  config,
  np = "",
  interactive = true,
}: {
  config: Record<string, unknown>;
  np?: string;
  interactive?: boolean;
}) {
  const headline = str(config.headline);
  const body = str(config.body);
  const source = str(config.source);
  const likes = typeof config.likesCount === "number" && config.likesCount > 0 ? config.likesCount : null;
  const comments = typeof config.commentsCount === "number" && config.commentsCount > 0 ? config.commentsCount : null;
  const shares = typeof config.sharesCount === "number" && config.sharesCount > 0 ? config.sharesCount : null;
  const allowComments = config.allowComments !== false;
  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4">
      <ReactionGroup np={np} single={config.singleReaction === true} disabled={!interactive}>
      {source ? (
        <div className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">{source}</div>
      ) : null}
      {headline ? (
        <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          {headline}
        </h2>
      ) : null}
      {body ? <p className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{body}</p> : null}
      {str(config.imageUrl).trim() ? (
        // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied arbitrary URL
        <img src={str(config.imageUrl)} alt="" className="max-h-[420px] w-full rounded-[var(--radius-md)] object-cover" />
      ) : null}
      {likes || comments || shares ? (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {likes ? `${likes} likes` : ""}
          {comments && allowComments ? ` · ${comments} comments` : ""}
          {shares ? ` · ${shares} shares` : ""}
        </span>
      ) : null}
      {interactive ? (
        <div className="flex items-center gap-4 border-t border-[var(--color-border-subtle)] pt-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <ReactionButton kind="liked" label="👍 Like" count={likes} activeCls="text-[var(--color-primary)]" />
          <ReactionButton kind="shared" label="↪ Share" count={shares} activeCls="text-[var(--color-primary)]" />
        </div>
      ) : null}
      {interactive && allowComments ? (
        <input
          type="text"
          name={`${np}comment`}
          placeholder="Write a comment…"
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none"
        />
      ) : null}
      </ReactionGroup>
    </article>
  );
}

function Likert7Input({ config, np }: { config: Record<string, unknown>; np: string }) {
  const left = str(config.leftAnchor) || "Strongly disagree";
  const right = str(config.rightAnchor) || "Strongly agree";
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex items-end justify-between gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <label key={n} className="flex flex-1 cursor-pointer flex-col items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            <input
              type="radio"
              name={`${np}value`}
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
    </div>
  );
}

function MultipleChoiceInput({ config, seed, np }: { config: Record<string, unknown>; seed?: string; np: string }) {
  const multiple = config.multiple === true;
  const raw = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  const options = config.randomizeOrder === true && seed ? seededShuffle(raw, seed) : raw;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      {options.map((opt, i) => (
        <label key={`${i}-${opt}`} className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type={multiple ? "checkbox" : "radio"} name={`${np}mc`} value={opt} className="size-4 accent-[var(--color-primary)]" />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function FreeTextInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const longForm = config.longForm === true;
  const maxLength = typeof config.maxLength === "number" ? config.maxLength : undefined;
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}text`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      {longForm ? (
        <textarea id={`${np}text`} name={`${np}text`} rows={5} maxLength={maxLength} className={FIELD_CLS} />
      ) : (
        <input id={`${np}text`} type="text" name={`${np}text`} maxLength={maxLength} className={FIELD_CLS} />
      )}
    </div>
  );
}

function SliderInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const min = num(config.min, 0);
  const max = num(config.max, 100);
  const step = num(config.step, 1);
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}value`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <input
        id={`${np}value`}
        type="range"
        name={`${np}value`}
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

function RankingInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const items = Array.isArray(config.items) ? (config.items as unknown[]).map(str) : [];
  const positions = items.map((_, i) => i + 1);
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Assign a rank to each item (1 = highest).</p>
      {items.map((item, i) => (
        <div key={`${i}-${item}`} className="flex items-center justify-between gap-2">
          <input type="hidden" name={`${np}item_${i}`} value={item} />
          <span className="min-w-0 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">{item}</span>
          <select
            name={`${np}rank_${i}`}
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
    </div>
  );
}

function AttentionCheckInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const options = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      {options.map((opt, i) => (
        <label key={`${i}-${opt}`} className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="radio" name={`${np}value`} value={opt} className="size-4 accent-[var(--color-primary)]" />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function DemographicsInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const genderOptions = ["Woman", "Man", "Non-binary", "Prefer to self-describe", "Prefer not to say"];
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <div className={PROMPT_CLS}>About you</div>
      {config.askAge !== false ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Age</span>
          <input type="number" name={`${np}age`} min={0} max={120} className={FIELD_CLS} />
        </label>
      ) : null}
      {config.askGender !== false ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Gender</span>
          <select name={`${np}gender`} defaultValue="" className={FIELD_CLS}>
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
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">Country of residence</span>
          <input type="text" name={`${np}country`} autoComplete="country-name" className={FIELD_CLS} />
        </label>
      ) : null}
    </div>
  );
}

/* ---------- C1: embedded content (stimulus-only) ---------- */

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
    <figure className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- researcher-supplied arbitrary URL */}
      <img src={url} alt={str(config.alt)} className="max-h-[480px] w-full rounded-[var(--radius-md)] object-contain" />
      {caption ? <figcaption className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{caption}</figcaption> : null}
    </figure>
  );
}

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
    <figure className="flex flex-col gap-[var(--take-field-gap,1rem)]">
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
      {caption ? <figcaption className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{caption}</figcaption> : null}
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
      <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{title || url}</span>
      {description ? (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{description}</span>
      ) : null}
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{host}</span>
    </a>
  );
}

/* ---------- C2: standard form blocks ---------- */

function SimpleFieldInput({
  config,
  type,
  np,
}: {
  config: Record<string, unknown>;
  type: "email" | "url" | "date" | "tel";
  np: string;
}) {
  const placeholder =
    type === "email" ? "name@example.com" : type === "url" ? "https://…" : type === "tel" ? "+1 555 123 4567" : undefined;
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}value`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <input id={`${np}value`} type={type} name={`${np}value`} placeholder={placeholder} required={config.required === true} className={FIELD_CLS} />
    </div>
  );
}

function NumberInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const unit = str(config.unit);
  const min = typeof config.min === "number" ? config.min : undefined;
  const max = typeof config.max === "number" ? config.max : undefined;
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}value`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <div className="flex items-center gap-2">
        <input id={`${np}value`} type="number" name={`${np}value`} min={min} max={max} required={config.required === true} className={FIELD_CLS} />
        {unit ? <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">{unit}</span> : null}
      </div>
    </div>
  );
}

function YesNoInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const yes = str(config.yesLabel) || "Yes";
  const no = str(config.noLabel) || "No";
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex gap-2">
        {[
          { v: "yes", label: yes },
          { v: "no", label: no },
        ].map((o) => (
          <label
            key={o.v}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-3 text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <input type="radio" name={`${np}value`} value={o.v} required={config.required === true} className="size-4 accent-[var(--color-primary)]" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function DropdownInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const options = Array.isArray(config.options) ? (config.options as unknown[]).map(str) : [];
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}value`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <select id={`${np}value`} name={`${np}value`} defaultValue="" required={config.required === true} className={FIELD_CLS}>
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

function AddressInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const fields = [
    { name: "street", label: "Street address", autoComplete: "street-address" },
    { name: "city", label: "City", autoComplete: "address-level2" },
    { name: "state", label: "State / region", autoComplete: "address-level1" },
    { name: "postal", label: "Postal code", autoComplete: "postal-code" },
    { name: "country", label: "Country", autoComplete: "country-name" },
  ];
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
          <input type="text" name={`${np}${f.name}`} autoComplete={f.autoComplete} className={FIELD_CLS} />
        </label>
      ))}
    </div>
  );
}

/** Composite field-group (ADR-0030) — researcher-defined fields on one card.
 *  The hidden `fkeys` input (key:type pairs) tells the server action which
 *  namespaced fields to read back (the matrix `rowCount` trick). */
function FieldGroupInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  type Spec = { key: string; label: string; type: string; required?: boolean; options?: string[] };
  const fields = (Array.isArray(config.fields) ? (config.fields as Spec[]) : []).filter(
    (f) => f && typeof f.key === "string" && /^[a-z0-9_]+$/.test(f.key),
  );
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <input type="hidden" name={`${np}fkeys`} value={fields.map((f) => `${f.key}:${f.type}`).join(",")} />
      {fields.map((f) => {
        const name = `${np}f_${f.key}`;
        const label = (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
        );
        if (f.type === "dropdown") {
          return (
            <label key={f.key} className="flex flex-col gap-1">
              {label}
              <select name={name} defaultValue="" required={f.required === true} className={FIELD_CLS}>
                <option value="" disabled>
                  Choose…
                </option>
                {(f.options ?? [])
                  .filter((o) => o.trim() !== "")
                  .map((o, i) => (
                    <option key={`${i}-${o}`} value={o}>
                      {o}
                    </option>
                  ))}
              </select>
            </label>
          );
        }
        if (f.type === "yes-no") {
          return (
            <div key={f.key} className="flex flex-col gap-1">
              {label}
              <div className="flex gap-4">
                {["yes", "no"].map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                    <input type="radio" name={name} value={v} required={f.required === true} className="size-4 accent-[var(--color-primary)]" />
                    {v === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        const inputType =
          f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text";
        return (
          <label key={f.key} className="flex flex-col gap-1">
            {label}
            <input type={inputType} name={name} required={f.required === true} className={FIELD_CLS} />
          </label>
        );
      })}
    </div>
  );
}

function ContactInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const fields = [
    { name: "name", label: "Name", type: "text", autoComplete: "name" },
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel" },
  ];
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{f.label}</span>
          <input type={f.type} name={`${np}${f.name}`} autoComplete={f.autoComplete} className={FIELD_CLS} />
        </label>
      ))}
    </div>
  );
}

function PictureChoiceInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const multiple = config.multiple === true;
  const urls = (Array.isArray(config.imageUrls) ? (config.imageUrls as unknown[]).map(str) : []).filter((u) => u.trim() !== "");
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, i) => (
          <label
            key={`${i}-${url}`}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2 hover:bg-[var(--color-surface-subtle)] has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-subtle)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- researcher-supplied URL */}
            <img src={url} alt={`Option ${i + 1}`} className="h-28 w-full rounded-[var(--radius-sm)] object-cover" />
            <input type={multiple ? "checkbox" : "radio"} name={`${np}mc`} value={url} className="size-4 accent-[var(--color-primary)]" />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------- Wave 3: research scales ---------- */

function NpsInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const left = str(config.leftLabel) || "Not at all likely";
  const right = str(config.rightLabel) || "Extremely likely";
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <label
            key={n}
            className="flex flex-1 min-w-[36px] cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)] has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-subtle)]"
          >
            <input
              type="radio"
              name={`${np}value`}
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
    </div>
  );
}

function StarRatingInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const max = typeof config.max === "number" ? config.max : 5;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          const v = i + 1;
          return (
            <label
              key={v}
              className="cursor-pointer text-[length:var(--text-display)] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-warning-text-on-subtle)] has-[:checked]:text-[var(--color-warning-text-on-subtle)]"
            >
              <input type="radio" name={`${np}value`} value={v} required={config.required === true} aria-label={`${v} of ${max} stars`} className="sr-only" />
              <span aria-hidden>★</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function VasInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const min = num(config.min, 0);
  const max = num(config.max, 100);
  const left = str(config.leftLabel);
  const right = str(config.rightLabel);
  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <label htmlFor={`${np}value`} className={PROMPT_CLS}>
        {str(config.prompt)}
      </label>
      <input id={`${np}value`} type="range" name={`${np}value`} min={min} max={max} step="any" defaultValue={(min + max) / 2} className="w-full accent-[var(--color-primary)]" />
      <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span>{left || String(min)}</span>
        <span>{right || String(max)}</span>
      </div>
    </div>
  );
}

/* ---------- Wave 3: composite scales ---------- */

function MatrixGridInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const rows = Array.isArray(config.rows) ? (config.rows as unknown[]).map(str) : [];
  const columns = Array.isArray(config.columns) ? (config.columns as unknown[]).map(str) : [];
  const required = config.required === true;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <input type="hidden" name={`${np}rowCount`} value={rows.length} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[length:var(--text-small)]">
          <thead>
            <tr>
              <th />
              {columns.map((col, j) => (
                <th key={j} className="px-2 py-1 text-center font-medium text-[var(--color-text-secondary)]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--color-border-subtle)]">
                <td className="py-2 pr-3 text-[var(--color-text-primary)]">{row}</td>
                {columns.map((col, j) => (
                  <td key={j} className="px-2 py-2 text-center">
                    <input type="radio" name={`${np}row_${i}`} value={col} required={required} aria-label={`${row}: ${col}`} className="size-4 accent-[var(--color-primary)]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SemanticDifferentialInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const left = Array.isArray(config.leftLabels) ? (config.leftLabels as unknown[]).map(str) : [];
  const right = Array.isArray(config.rightLabels) ? (config.rightLabels as unknown[]).map(str) : [];
  const points = typeof config.points === "number" ? config.points : 7;
  const pairs = Math.min(left.length, right.length);
  const required = config.required === true;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <input type="hidden" name={`${np}rowCount`} value={pairs} />
      {Array.from({ length: pairs }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-right text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{left[i]}</span>
          <div className="flex flex-1 justify-between">
            {Array.from({ length: points }, (_, p) => (
              <label key={p} className="cursor-pointer">
                <input type="radio" name={`${np}row_${i}`} value={p + 1} required={required} aria-label={`${left[i]} to ${right[i]}: ${p + 1} of ${points}`} className="size-4 accent-[var(--color-primary)]" />
              </label>
            ))}
          </div>
          <span className="w-24 shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{right[i]}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Wave 3: MaxDiff ---------- */

function MaxDiffInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const items = Array.isArray(config.items) ? (config.items as unknown[]).map(str) : [];
  const required = config.required === true;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <table className="w-full border-collapse text-[length:var(--text-small)]">
        <thead>
          <tr>
            <th />
            <th className="w-20 px-2 py-1 text-center font-medium text-[var(--color-text-secondary)]">Best</th>
            <th className="w-20 px-2 py-1 text-center font-medium text-[var(--color-text-secondary)]">Worst</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-[var(--color-border-subtle)]">
              <td className="py-2 pr-3 text-[var(--color-text-primary)]">{item}</td>
              <td className="px-2 py-2 text-center">
                <input type="radio" name={`${np}best`} value={item} required={required} aria-label={`Best: ${item}`} className="size-4 accent-[var(--color-primary)]" />
              </td>
              <td className="px-2 py-2 text-center">
                <input type="radio" name={`${np}worst`} value={item} required={required} aria-label={`Worst: ${item}`} className="size-4 accent-[var(--color-primary)]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/* ---------- Wave 1 (2026-06-13) choice & judgment renders ---------- */

function AccuracyConfidenceInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const options = (Array.isArray(config.options) ? config.options : []).map(str).filter((o) => o.trim() !== "");
  const required = config.required !== false;
  const max = num(config.confidenceMax, 100);
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex flex-wrap gap-4">
        {options.map((o, i) => (
          <label key={`${i}-${o}`} className="flex items-center gap-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
            <input type="radio" name={`${np}accuracy`} value={o} required={required} className="size-4 accent-[var(--color-primary)]" />
            {o}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{str(config.confidenceLabel) || "Confidence"}</span>
        <input type="range" name={`${np}confidence`} min={0} max={max} defaultValue={Math.round(max / 2)} className="w-full accent-[var(--color-primary)]" aria-label={str(config.confidenceLabel) || "Confidence"} />
      </label>
    </div>
  );
}

function ShareIntentionInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const options = (Array.isArray(config.options) ? config.options : []).map(str).filter((o) => o.trim() !== "");
  const required = config.required !== false;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex flex-wrap gap-4">
        {options.map((o, i) => (
          <label key={`${i}-${o}`} className="flex items-center gap-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
            <input type="radio" name={`${np}intention`} value={o} required={required} className="size-4 accent-[var(--color-primary)]" />
            {o}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{str(config.whyPrompt) || "Why?"}</span>
        <textarea name={`${np}why`} rows={2} className={FIELD_CLS} />
      </label>
    </div>
  );
}

function ConstantSumInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const items = (Array.isArray(config.items) ? config.items : []).map(str);
  const total = num(config.total, 100);
  const unit = str(config.unit) || "points";
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Must total {total} {unit}.</p>
      {items.map((label, i) => (
        <label key={i} className="flex items-center justify-between gap-3">
          <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{label}</span>
          <input type="number" name={`${np}cs_${i}`} min={0} max={total} className={`${FIELD_CLS} max-w-[120px]`} />
        </label>
      ))}
    </div>
  );
}

function SideBySideInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const rows = (Array.isArray(config.rows) ? config.rows : []).map(str);
  const columns = (Array.isArray(config.columns) ? config.columns : []) as { key: string; label: string; options: string[] }[];
  const required = config.required !== false;
  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className={PROMPT_CLS}>{str(config.prompt)}</p>
      <div className="flex flex-col gap-3">
        {rows.map((rowLabel, ri) => (
          <div key={ri} role="group" aria-label={rowLabel} className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
            <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{rowLabel}</span>
            <div className="flex flex-wrap gap-4">
              {columns.map((col) => (
                <label key={col.key} className="flex flex-col gap-1">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{col.label}</span>
                  <select name={`${np}sbs_${ri}_${col.key}`} defaultValue="" required={required} className={FIELD_CLS} aria-label={`${rowLabel} — ${col.label}`}>
                    <option value="" disabled>Choose…</option>
                    {(col.options ?? []).filter((o) => o.trim() !== "").map((o, oi) => (
                      <option key={`${oi}-${o}`} value={o}>{o}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
