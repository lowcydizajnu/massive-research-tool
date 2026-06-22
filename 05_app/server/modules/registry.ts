import { z } from "zod";

/**
 * In-repo module registry — the runtime source of truth for module config
 * schemas (Zod), display metadata, and default config (per ADR-0001 + ADR-0012).
 * The DB `module_version.schema` column stores the `jsonSchema` mirror for
 * record/query; this registry is what write-time validation runs against.
 *
 * V1 ships two core modules (ADR-0012): the Builder validates and renders
 * blocks against these.
 */
export type CoreModuleDef = {
  source: "core";
  key: string;
  version: string;
  name: string;
  description: string;
  categoryTags: string[];
  /** Runtime validation schema (structural). */
  configSchema: z.ZodType<Record<string, unknown>>;
  /** Valid starting config for a freshly-added block. */
  defaultConfig: Record<string, unknown>;
  /** JSON-Schema mirror stored in module_version.schema. */
  jsonSchema: Record<string, unknown>;
  /**
   * Whether this module collects a participant answer (a "question") or is a
   * pure stimulus (no response_item is written for it). ADR-0014.
   */
  collectsResponse: boolean;
  /**
   * Shape a participant's answer must match — validated server-side at the
   * participant runtime before a `response_item.answer` is written (same
   * registry-is-source-of-truth pattern as configSchema). `null` for pure
   * stimuli. The "required" decision is config-driven and enforced separately
   * by the runtime (an empty answer to a required question is rejected).
   */
  responseSchema: z.ZodType<Record<string, unknown>> | null;
  /**
   * Whether a (shape-valid) answer counts as "blank" for the required check —
   * the participant runtime rejects a blank answer to a required question.
   * Defaults to null/empty-object when omitted; modules with their own notion of
   * empty (e.g. `{selected: []}`, `{text: "  "}`) provide this. ADR-0014.
   */
  isAnswerEmpty?: (answer: unknown) => boolean;
  /**
   * Config-dependent answer validation the static Zod responseSchema can't
   * express — e.g. a selection must be one of the block's options, a ranking
   * must be over the block's items, a slider value must be in range. Runs
   * server-side after the shape check (a crafted /take POST can't bypass the
   * UI). Returns false → the runtime rejects the answer (invalid_answer).
   */
  validateAnswer?: (answer: unknown, config: Record<string, unknown>) => boolean;
  /**
   * Completeness for the "valid / missing field" badge — a block can be
   * structurally valid (Zod-OK) but still missing a required value while the
   * researcher fills it in. Distinct from structural validity on purpose.
   */
  isComplete: (config: Record<string, unknown>) => boolean;
};

/** Media URL fields accept an external https URL OR an uploaded-asset path
 *  ("/api/media/…", ADR-0003) — zod's .url() alone rejects the relative form. */
const mediaUrl = z.union([z.string().url(), z.string().regex(/^\/api\/media\/ws\/[A-Za-z0-9/_.-]+$/), z.literal("")]);

const socialPost: CoreModuleDef = {
  source: "core",
  key: "social-post",
  version: "1.0.0",
  name: "Social post",
  description:
    "A simulated social-media post used as a misinformation stimulus (headline, body, source, optional image).",
  categoryTags: ["misinformation", "stimulus", "social"],
  configSchema: z.object({
    headline: z.string(),
    body: z.string(),
    source: z.string(),
    imageUrl: mediaUrl,
    shareCountVisible: z.boolean(),
  }),
  defaultConfig: {
    headline: "",
    body: "",
    source: "",
    imageUrl: "",
    shareCountVisible: false,
  },
  jsonSchema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      body: { type: "string" },
      source: { type: "string" },
      imageUrl: { type: "string" },
      shareCountVisible: { type: "boolean" },
    },
    required: ["headline"],
    additionalProperties: false,
  },
  // Pure stimulus — participants read it; it collects no answer.
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.headline === "string" && c.headline.trim().length > 0,
};

const likert7: CoreModuleDef = {
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  name: "Likert (7-point)",
  description:
    "A 7-point Likert scale, typically a manipulation check (prompt + anchor labels).",
  categoryTags: ["measurement", "manipulation-check"],
  configSchema: z.object({
    prompt: z.string(),
    leftAnchor: z.string(),
    rightAnchor: z.string(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "",
    leftAnchor: "Strongly disagree",
    rightAnchor: "Strongly agree",
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      leftAnchor: { type: "string" },
      rightAnchor: { type: "string" },
      required: { type: "boolean" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  // A 7-point scale collects a single integer 1..7.
  collectsResponse: true,
  responseSchema: z.object({ value: z.number().int().min(1).max(7) }),
  isAnswerEmpty: (a) =>
    !a || typeof (a as { value?: unknown }).value !== "number",
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

// social-post v2.0.0 — promotes the v1 placeholder to a real misinformation
// stimulus with veracity ground-truth + topic tags (researcher metadata, NOT
// shown to participants). v1.0.0 stays in the registry for studies pinned to it
// (ModuleVersion immutability, ADR-0001/0012).
const socialPostV2: CoreModuleDef = {
  source: "core",
  key: "social-post",
  version: "2.0.0",
  name: "Social post",
  description:
    "A simulated social-media post used as a misinformation stimulus, with veracity ground-truth and topic tags for analysis.",
  categoryTags: ["misinformation", "stimulus", "social"],
  configSchema: z.object({
    headline: z.string(),
    body: z.string(),
    source: z.string(),
    veracityGroundTruth: z.enum(["true", "false", "misleading", "unverified"]),
    topicTags: z.array(z.string()),
    imageUrl: mediaUrl,
    /** Legacy toggle (pre-engagement); counts now show whenever they are > 0. */
    shareCountVisible: z.boolean().optional(),
    // Engagement controls (ADR-0024 mimicking presets): researcher-set numbers
    // shown by platform-styled renderers. Optional + additive (old configs valid).
    likesCount: z.number().int().min(0).max(100_000_000).optional(),
    commentsCount: z.number().int().min(0).max(100_000_000).optional(),
    sharesCount: z.number().int().min(0).max(100_000_000).optional(),
    authorHandle: z.string().max(60).optional(),
    timeLabel: z.string().max(40).optional(),
    allowComments: z.boolean().optional(),
    /** Participant may pick ONLY ONE reaction (Like OR Share) when true. */
    singleReaction: z.boolean().optional(),
  }),
  defaultConfig: {
    headline: "",
    body: "",
    source: "",
    veracityGroundTruth: "unverified",
    topicTags: [],
    imageUrl: "",
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    authorHandle: "",
    timeLabel: "2h",
    allowComments: true,
    singleReaction: false,
  },
  jsonSchema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      body: { type: "string" },
      source: { type: "string" },
      veracityGroundTruth: { enum: ["true", "false", "misleading", "unverified"] },
      topicTags: { type: "array", items: { type: "string" } },
      imageUrl: { type: "string" },
      shareCountVisible: { type: "boolean" },
      likesCount: { type: "integer", minimum: 0 },
      commentsCount: { type: "integer", minimum: 0 },
      sharesCount: { type: "integer", minimum: 0 },
      authorHandle: { type: "string" },
      timeLabel: { type: "string" },
      allowComments: { type: "boolean" },
      singleReaction: { type: "boolean" },
    },
    required: ["headline", "source", "veracityGroundTruth"],
    additionalProperties: false,
  },
  // The post MEASURES engagement (owner 2026-06-10): participants may Like /
  // Share / comment, and the interaction is recorded as this block's answer
  // (exposure is recorded even with no interaction — liked/shared false).
  collectsResponse: true,
  responseSchema: z.object({
    liked: z.boolean(),
    shared: z.boolean(),
    comment: z.string().max(2000).optional(),
  }),
  // Never blocks the participant — interacting with a stimulus is always optional.
  isAnswerEmpty: () => false,
  validateAnswer: (a, config) => {
    const ans = a as { comment?: unknown; liked?: unknown; shared?: unknown };
    if (config.allowComments === false && typeof ans.comment === "string" && ans.comment.trim() !== "") return false;
    if (config.singleReaction === true && ans.liked === true && ans.shared === true) return false;
    return true;
  },
  isComplete: (c) =>
    typeof c.headline === "string" &&
    c.headline.trim().length > 0 &&
    typeof c.source === "string" &&
    c.source.trim().length > 0,
};

// Single- or multi-select choice question.
const multipleChoice: CoreModuleDef = {
  source: "core",
  key: "multiple-choice",
  version: "1.0.0",
  name: "Multiple choice",
  description: "A single-select or multi-select choice question with researcher-defined options.",
  categoryTags: ["measurement", "choice"],
  configSchema: z.object({
    prompt: z.string(),
    options: z.array(z.string()),
    multiple: z.boolean(),
    required: z.boolean(),
    randomizeOrder: z.boolean(),
  }),
  defaultConfig: {
    prompt: "",
    options: ["Option 1", "Option 2"],
    multiple: false,
    required: true,
    randomizeOrder: false,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      multiple: { type: "boolean" },
      required: { type: "boolean" },
      randomizeOrder: { type: "boolean" },
    },
    required: ["prompt", "options"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ selected: z.array(z.string().max(500)).max(50) }),
  isAnswerEmpty: (a) => !Array.isArray((a as { selected?: unknown })?.selected) || (a as { selected: unknown[] }).selected.length === 0,
  // Selections must be among the block's options; single-select allows ≤1.
  validateAnswer: (a, config) => {
    const selected = (a as { selected?: unknown })?.selected;
    if (!Array.isArray(selected)) return false;
    const options = Array.isArray(config.options) ? config.options.map(String) : [];
    if (config.multiple !== true && selected.length > 1) return false;
    return selected.every((s) => options.includes(String(s)));
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.options) &&
    c.options.length >= 2,
};

// Free-text response (short input or long textarea).
const freeText: CoreModuleDef = {
  source: "core",
  key: "free-text",
  version: "1.0.0",
  name: "Free text",
  description: "An open-ended text response — a short line or a long paragraph.",
  categoryTags: ["measurement", "open-ended"],
  configSchema: z.object({
    prompt: z.string(),
    longForm: z.boolean(),
    required: z.boolean(),
    maxLength: z.number().int().min(1).max(10000),
  }),
  defaultConfig: { prompt: "", longForm: false, required: true, maxLength: 500 },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      longForm: { type: "boolean" },
      required: { type: "boolean" },
      maxLength: { type: "integer", minimum: 1, maximum: 10000 },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  // Hard 10k ceiling on stored text regardless of the config maxLength.
  responseSchema: z.object({ text: z.string().max(10000) }),
  isAnswerEmpty: (a) => typeof (a as { text?: unknown })?.text !== "string" || (a as { text: string }).text.trim().length === 0,
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

// Numeric slider over a researcher-defined range.
const slider: CoreModuleDef = {
  source: "core",
  key: "slider",
  version: "1.0.0",
  name: "Slider",
  description: "A numeric slider over a researcher-defined min/max range.",
  categoryTags: ["measurement", "scale"],
  configSchema: z.object({
    prompt: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    required: z.boolean(),
  }),
  defaultConfig: { prompt: "", min: 0, max: 100, step: 1, required: true },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      min: { type: "number" },
      max: { type: "number" },
      step: { type: "number" },
      required: { type: "boolean" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number() }),
  isAnswerEmpty: (a) => typeof (a as { value?: unknown })?.value !== "number",
  // Value must fall within the configured [min, max] range.
  validateAnswer: (a, config) => {
    const v = (a as { value?: unknown })?.value;
    const min = typeof config.min === "number" ? config.min : -Infinity;
    const max = typeof config.max === "number" ? config.max : Infinity;
    return typeof v === "number" && v >= min && v <= max;
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

// Rank a set of items into an order.
const ranking: CoreModuleDef = {
  source: "core",
  key: "ranking",
  version: "1.0.0",
  name: "Ranking",
  description: "Order a set of items by preference / priority.",
  categoryTags: ["measurement", "ranking"],
  configSchema: z.object({
    prompt: z.string(),
    items: z.array(z.string()),
    required: z.boolean(),
  }),
  defaultConfig: { prompt: "", items: ["Item 1", "Item 2", "Item 3"], required: true },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      items: { type: "array", items: { type: "string" } },
      required: { type: "boolean" },
    },
    required: ["prompt", "items"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ order: z.array(z.string().max(500)).max(100) }),
  // Every ranked entry must be one of the block's items.
  validateAnswer: (a, config) => {
    const order = (a as { order?: unknown })?.order;
    if (!Array.isArray(order)) return false;
    const items = Array.isArray(config.items) ? config.items.map(String) : [];
    return order.every((o) => items.includes(String(o)));
  },
  isAnswerEmpty: (a) => !Array.isArray((a as { order?: unknown })?.order) || (a as { order: unknown[] }).order.length === 0,
  isComplete: (c) =>
    typeof c.prompt === "string" && c.prompt.trim().length > 0 && Array.isArray(c.items) && c.items.length >= 2,
};

// Prolific-style attention check — a single-select with a known correct answer.
const attentionCheck: CoreModuleDef = {
  source: "core",
  key: "attention-check",
  version: "1.0.0",
  name: "Attention check",
  description:
    "An instructed-response attention check (single-select with a known correct option) for data-quality screening.",
  categoryTags: ["quality", "attention-check"],
  configSchema: z.object({
    prompt: z.string(),
    options: z.array(z.string()),
    correctAnswer: z.string(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "To show you are paying attention, select “Strongly agree”.",
    options: ["Strongly disagree", "Neutral", "Strongly agree"],
    correctAnswer: "Strongly agree",
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      correctAnswer: { type: "string" },
      required: { type: "boolean" },
    },
    required: ["prompt", "options", "correctAnswer"],
    additionalProperties: false,
  },
  collectsResponse: true,
  // Reuses the multiple-choice answer shape (single selection) so Results can
  // count per option; pass = selected === config.correctAnswer.
  responseSchema: z.object({ selected: z.array(z.string().max(500)).max(1) }),
  // The single selection must be one of the options.
  validateAnswer: (a, config) => {
    const selected = (a as { selected?: unknown })?.selected;
    if (!Array.isArray(selected) || selected.length > 1) return false;
    const options = Array.isArray(config.options) ? config.options.map(String) : [];
    return selected.every((s) => options.includes(String(s)));
  },
  isAnswerEmpty: (a) => !Array.isArray((a as { selected?: unknown })?.selected) || (a as { selected: unknown[] }).selected.length === 0,
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.options) &&
    c.options.length >= 2 &&
    typeof c.correctAnswer === "string" &&
    c.correctAnswer.length > 0,
};

// Standard demographics — a compact, i18n-friendly fixed set of optional fields.
const demographics: CoreModuleDef = {
  source: "core",
  key: "demographics",
  version: "1.0.0",
  name: "Demographics",
  description:
    "A standard demographics block (age, gender, country) with inclusive, i18n-friendly defaults. Toggle fields on/off.",
  categoryTags: ["demographics"],
  configSchema: z.object({
    askAge: z.boolean(),
    askGender: z.boolean(),
    askCountry: z.boolean(),
    required: z.boolean(),
  }),
  defaultConfig: { askAge: true, askGender: true, askCountry: true, required: false },
  jsonSchema: {
    type: "object",
    properties: {
      askAge: { type: "boolean" },
      askGender: { type: "boolean" },
      askCountry: { type: "boolean" },
      required: { type: "boolean" },
    },
    required: [],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    age: z.string().optional(),
    gender: z.string().optional(),
    country: z.string().optional(),
  }),
  isAnswerEmpty: (a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return ![o.age, o.gender, o.country].some((v) => typeof v === "string" && v.trim().length > 0);
  },
  isComplete: () => true, // toggles only; always structurally complete
};

// ---------- V1.12 C1: embedded content (stimulus-only, no response) ----------

const textBlock: CoreModuleDef = {
  source: "core",
  key: "text",
  version: "1.0.0",
  name: "Text",
  description: "A block of instructional or narrative text (markdown).",
  categoryTags: ["content", "instructions"],
  configSchema: z.object({ contentMd: z.string() }),
  defaultConfig: { contentMd: "" },
  jsonSchema: {
    type: "object",
    properties: { contentMd: { type: "string" } },
    required: ["contentMd"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.contentMd === "string" && c.contentMd.trim().length > 0,
};

const imageBlock: CoreModuleDef = {
  source: "core",
  key: "image",
  version: "1.0.0",
  name: "Image",
  description: "An embedded image stimulus (URL), with alt text and an optional caption.",
  categoryTags: ["content", "stimulus", "media"],
  configSchema: z.object({
    url: mediaUrl,
    alt: z.string(),
    caption: z.string(),
  }),
  defaultConfig: { url: "", alt: "", caption: "" },
  jsonSchema: {
    type: "object",
    properties: { url: { type: "string" }, alt: { type: "string" }, caption: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.url === "string" && c.url.trim().length > 0,
};

const videoBlock: CoreModuleDef = {
  source: "core",
  key: "video",
  version: "1.0.0",
  name: "Video",
  description: "An embedded video (YouTube, Vimeo, or direct MP4 URL), with an optional caption.",
  categoryTags: ["content", "stimulus", "media"],
  configSchema: z.object({
    url: mediaUrl,
    caption: z.string(),
  }),
  defaultConfig: { url: "", caption: "" },
  jsonSchema: {
    type: "object",
    properties: { url: { type: "string" }, caption: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.url === "string" && c.url.trim().length > 0,
};

const linkBlock: CoreModuleDef = {
  source: "core",
  key: "link",
  version: "1.0.0",
  name: "Link preview (stimulus)",
  description:
    "A clickable link card SHOWN to participants as stimulus — collects no answer. (To ask a participant to enter a web address, use the “Website / URL” form block.)",
  categoryTags: ["content", "stimulus"],
  configSchema: z.object({
    url: z.union([z.string().url(), z.literal("")]),
    title: z.string(),
    description: z.string(),
  }),
  defaultConfig: { url: "", title: "", description: "" },
  jsonSchema: {
    type: "object",
    properties: { url: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.url === "string" && c.url.trim().length > 0,
};

// ---------- V1.12 C2 (Group 1): standard form blocks ----------

const valueStr = (a: unknown): string => {
  const v = (a as { value?: unknown })?.value;
  return typeof v === "string" ? v : "";
};
const blankValue = (a: unknown) => valueStr(a).trim().length === 0;

const emailBlock: CoreModuleDef = {
  source: "core",
  key: "email",
  version: "1.0.0",
  name: "Email",
  description: "A single email-address field (format-validated).",
  categoryTags: ["form", "contact"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string().max(320) }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a) => {
    const v = valueStr(a);
    return v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const urlBlock: CoreModuleDef = {
  source: "core",
  key: "url",
  version: "1.0.0",
  name: "Website / URL",
  description: "A single URL field (http/https, format-validated).",
  categoryTags: ["form"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string().max(2000) }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a) => {
    const v = valueStr(a);
    return v === "" || /^https?:\/\/.+/.test(v);
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const numberBlock: CoreModuleDef = {
  source: "core",
  key: "number",
  version: "1.0.0",
  name: "Number",
  description: "A numeric field with optional min/max and a unit suffix.",
  categoryTags: ["form", "measurement"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    min: z.number(),
    max: z.number(),
    unit: z.string(),
  }),
  defaultConfig: { prompt: "", required: true, min: 0, max: 100, unit: "" },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      min: { type: "number" },
      max: { type: "number" },
      unit: { type: "string" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number() }),
  isAnswerEmpty: (a) => typeof (a as { value?: unknown })?.value !== "number" || Number.isNaN((a as { value: number }).value),
  validateAnswer: (a, c) => {
    const v = (a as { value?: unknown })?.value;
    if (typeof v !== "number" || Number.isNaN(v)) return false;
    const min = typeof c.min === "number" ? c.min : -Infinity;
    const max = typeof c.max === "number" ? c.max : Infinity;
    return v >= min && v <= max;
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const dateBlock: CoreModuleDef = {
  source: "core",
  key: "date",
  version: "1.0.0",
  name: "Date",
  description: "A date field (ISO 8601).",
  categoryTags: ["form"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string().max(40) }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a) => {
    const v = valueStr(a);
    return v === "" || !Number.isNaN(Date.parse(v));
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const yesNoBlock: CoreModuleDef = {
  source: "core",
  key: "yes-no",
  version: "1.0.0",
  name: "Yes / No",
  description: "A binary choice with configurable labels (Yes/No, True/False, …).",
  categoryTags: ["form"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    yesLabel: z.string(),
    noLabel: z.string(),
  }),
  defaultConfig: { prompt: "", required: true, yesLabel: "Yes", noLabel: "No" },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      yesLabel: { type: "string" },
      noLabel: { type: "string" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string() }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a) => {
    const v = valueStr(a);
    return v === "" || v === "yes" || v === "no";
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const dropdownBlock: CoreModuleDef = {
  source: "core",
  key: "dropdown",
  version: "1.0.0",
  name: "Dropdown",
  description: "A single-select dropdown — good for long option lists.",
  categoryTags: ["form", "measurement"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    options: z.array(z.string()),
  }),
  defaultConfig: { prompt: "", required: true, options: ["Option 1", "Option 2"] },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      options: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "options"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string() }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a, c) => {
    const v = valueStr(a);
    if (v === "") return true;
    const opts = Array.isArray(c.options) ? (c.options as unknown[]).map(String) : [];
    return opts.includes(v);
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0 && Array.isArray(c.options) && c.options.length > 0,
};

// ---------- V1.12 C2 (batch 2): phone, address, contact, picture-choice ----------

const phoneBlock: CoreModuleDef = {
  source: "core",
  key: "phone",
  version: "1.0.0",
  name: "Phone number",
  description: "A phone-number field (light E.164-style validation).",
  categoryTags: ["form", "contact"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.string().max(40) }),
  isAnswerEmpty: blankValue,
  validateAnswer: (a) => {
    const v = valueStr(a).trim();
    return v === "" || /^\+?[0-9][0-9\s\-().]{5,19}$/.test(v);
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const sField = (a: unknown, k: string): string => {
  const v = (a as Record<string, unknown> | null)?.[k];
  return typeof v === "string" ? v : "";
};

const addressBlock: CoreModuleDef = {
  source: "core",
  key: "address",
  version: "1.0.0",
  name: "Address",
  description: "A structured postal address (street, city, state, postal code, country).",
  categoryTags: ["form", "contact"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    street: z.string().max(300).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postal: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
  }),
  isAnswerEmpty: (a) =>
    ["street", "city", "state", "postal", "country"].every((k) => sField(a, k).trim() === ""),
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const contactBlock: CoreModuleDef = {
  source: "core",
  key: "contact",
  version: "1.0.0",
  name: "Contact info",
  description: "Name + email (+ optional phone) on one screen.",
  categoryTags: ["form", "contact"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    name: z.string().max(200).optional(),
    email: z.string().max(320).optional(),
    phone: z.string().max(40).optional(),
  }),
  isAnswerEmpty: (a) => sField(a, "name").trim() === "" && sField(a, "email").trim() === "",
  validateAnswer: (a) => {
    const e = sField(a, "email").trim();
    return e === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

/**
 * Composite field-group (ADR-0030) — the "editable Address": ONE block whose
 * sub-fields the researcher defines in config (add/remove/relabel/type). Records
 * one structured answer `{values: {fieldKey: …}}` (same family as matrix-grid).
 */
const FIELD_TYPES = ["text", "number", "email", "phone", "date", "dropdown", "yes-no"] as const;
const fieldSpecSchema = z.object({
  /** Stable slug — frozen after creation so data stays joinable across renames. */
  key: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  /** Dropdown choices (dropdown type only). */
  options: z.array(z.string()).optional(),
});
type FieldSpec = z.infer<typeof fieldSpecSchema>;
const readFields = (c: Record<string, unknown>): FieldSpec[] =>
  Array.isArray(c.fields) ? (c.fields as FieldSpec[]) : [];

/**
 * Audio recording (handoff C2 Group 3, ADR-0003): participant records their
 * voice (MediaRecorder, explicit consent-to-record press), the clip uploads to
 * R2 via the participant presign endpoint, and the answer stores the storage
 * key + duration. Playback/export reference: /api/media/<r2Key>.
 */
const audioRecordBlock: CoreModuleDef = {
  source: "core",
  key: "audio-record",
  version: "1.0.0",
  name: "Audio recording",
  description: "Participants record a spoken answer (microphone; researcher-set time limit).",
  categoryTags: ["measurement", "media"],
  configSchema: z.object({
    prompt: z.string(),
    maxDurationSeconds: z.number().int().min(5).max(300),
    required: z.boolean(),
  }),
  defaultConfig: { prompt: "", maxDurationSeconds: 60, required: true },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      maxDurationSeconds: { type: "integer", minimum: 5, maximum: 300 },
      required: { type: "boolean" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    r2Key: z.string().regex(/^resp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(300),
    durationMs: z.number().int().positive().max(3_600_000),
  }),
  isAnswerEmpty: (a) => !a || typeof (a as { r2Key?: unknown }).r2Key !== "string",
  validateAnswer: (a, config) => {
    const max = typeof config.maxDurationSeconds === "number" ? config.maxDurationSeconds : 300;
    const dur = (a as { durationMs?: unknown }).durationMs;
    return typeof dur === "number" && dur <= max * 1000 + 3000; // small stop-latency slack
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const fieldGroupBlock: CoreModuleDef = {
  source: "core",
  key: "field-group",
  version: "1.0.0",
  name: "Custom field group",
  description:
    "One card with fields you define — add, remove, rename, and type each field (like an editable Address). Records one combined answer.",
  categoryTags: ["form", "custom"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    fields: z.array(fieldSpecSchema),
  }),
  defaultConfig: {
    prompt: "",
    required: true,
    fields: [
      { key: "field_1", label: "Field 1", type: "text" },
      { key: "field_2", label: "Field 2", type: "text" },
    ],
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", pattern: "^[a-z0-9_]+$" },
            label: { type: "string" },
            type: { type: "string", enum: [...FIELD_TYPES] },
            required: { type: "boolean" },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["key", "label", "type"],
          additionalProperties: false,
        },
      },
    },
    required: ["prompt", "fields"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    values: z.record(z.string(), z.union([z.string().max(2000), z.number()])),
  }),
  isAnswerEmpty: (a) => {
    const values =
      a && typeof a === "object" && (a as Record<string, unknown>).values
        ? ((a as Record<string, unknown>).values as Record<string, unknown>)
        : {};
    return Object.values(values).every((v) => v == null || String(v).trim() === "");
  },
  validateAnswer: (a, config) => {
    const fields = readFields(config);
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const values = ((a as Record<string, unknown>).values ?? {}) as Record<string, unknown>;
    // No stray keys outside the configured fields.
    for (const k of Object.keys(values)) if (!byKey.has(k)) return false;
    for (const f of fields) {
      const raw = values[f.key];
      const s = raw == null ? "" : String(raw).trim();
      if (s === "") {
        if (f.required === true) return false;
        continue;
      }
      if (f.type === "number" && (typeof raw !== "number" || !Number.isFinite(raw))) return false;
      if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return false;
      if (f.type === "yes-no" && s !== "yes" && s !== "no") return false;
      if (f.type === "dropdown" && !(f.options ?? []).includes(s)) return false;
    }
    return true;
  },
  isComplete: (c) => {
    const fields = readFields(c);
    return (
      typeof c.prompt === "string" &&
      c.prompt.trim().length > 0 &&
      fields.length > 0 &&
      fields.every(
        (f) =>
          f.label.trim().length > 0 &&
          (f.type !== "dropdown" || (f.options ?? []).filter((o) => o.trim() !== "").length > 0),
      )
    );
  },
};

const pictureChoiceBlock: CoreModuleDef = {
  source: "core",
  key: "picture-choice",
  version: "1.0.0",
  name: "Picture choice",
  description: "Image-based options (paste image URLs); single or multi-select.",
  categoryTags: ["form", "measurement"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    multiple: z.boolean(),
    imageUrls: z.array(z.string()),
  }),
  defaultConfig: { prompt: "", required: true, multiple: false, imageUrls: [""] },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      multiple: { type: "boolean" },
      imageUrls: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "imageUrls"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ selected: z.array(z.string()) }),
  isAnswerEmpty: (a) => !Array.isArray((a as { selected?: unknown })?.selected) || (a as { selected: unknown[] }).selected.length === 0,
  validateAnswer: (a, c) => {
    const sel = Array.isArray((a as { selected?: unknown })?.selected)
      ? ((a as { selected: unknown[] }).selected.map(String))
      : [];
    const urls = Array.isArray(c.imageUrls) ? (c.imageUrls as unknown[]).map(String) : [];
    return sel.every((s) => urls.includes(s));
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.imageUrls) &&
    (c.imageUrls as unknown[]).filter((u) => String(u).trim() !== "").length > 0,
};

// ---------- V1.12 Wave 3 (batch 1): numeric research scales ----------

const numVal = (a: unknown): number | null => {
  const v = (a as { value?: unknown })?.value;
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
};

const npsBlock: CoreModuleDef = {
  source: "core",
  key: "nps",
  version: "1.0.0",
  name: "Net Promoter Score (0–10)",
  description: "An 11-point 0–10 likelihood-to-recommend scale (NPS).",
  categoryTags: ["measurement", "rating"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    leftLabel: z.string(),
    rightLabel: z.string(),
  }),
  defaultConfig: {
    prompt: "",
    required: true,
    leftLabel: "Not at all likely",
    rightLabel: "Extremely likely",
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      leftLabel: { type: "string" },
      rightLabel: { type: "string" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number().int().min(0).max(10) }),
  isAnswerEmpty: (a) => numVal(a) === null,
  validateAnswer: (a) => {
    const v = numVal(a);
    return v !== null && Number.isInteger(v) && v >= 0 && v <= 10;
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const ratingStarsBlock: CoreModuleDef = {
  source: "core",
  key: "rating-stars",
  version: "1.0.0",
  name: "Star rating",
  description: "A 1-to-N star rating.",
  categoryTags: ["measurement", "rating"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean(), max: z.number().int().min(2).max(10) }),
  defaultConfig: { prompt: "", required: true, max: 5 },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      max: { type: "integer", minimum: 2, maximum: 10 },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number().int().min(1).max(10) }),
  isAnswerEmpty: (a) => numVal(a) === null,
  validateAnswer: (a, c) => {
    const v = numVal(a);
    const max = typeof c.max === "number" ? c.max : 5;
    return v !== null && Number.isInteger(v) && v >= 1 && v <= max;
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

const vasBlock: CoreModuleDef = {
  source: "core",
  key: "vas",
  version: "1.0.0",
  name: "Visual analog scale",
  description: "A continuous slider between two labelled anchors (VAS).",
  categoryTags: ["measurement", "rating"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    min: z.number(),
    max: z.number(),
    leftLabel: z.string(),
    rightLabel: z.string(),
  }),
  defaultConfig: { prompt: "", required: true, min: 0, max: 100, leftLabel: "", rightLabel: "" },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      min: { type: "number" },
      max: { type: "number" },
      leftLabel: { type: "string" },
      rightLabel: { type: "string" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number() }),
  isAnswerEmpty: (a) => numVal(a) === null,
  validateAnswer: (a, c) => {
    const v = numVal(a);
    if (v === null) return false;
    const min = typeof c.min === "number" ? c.min : 0;
    const max = typeof c.max === "number" ? c.max : 100;
    return v >= min && v <= max;
  },
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

// ---------- V1.12 Wave 3 (batch 2): composite scales ----------

const valuesObj = (a: unknown): Record<string, unknown> => {
  const v = (a as { values?: unknown })?.values;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

const matrixGridBlock: CoreModuleDef = {
  source: "core",
  key: "matrix-grid",
  version: "1.0.0",
  name: "Matrix / grid",
  description: "A grid of statements (rows) each rated on a shared scale (columns).",
  categoryTags: ["measurement", "matrix"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    rows: z.array(z.string()),
    columns: z.array(z.string()),
  }),
  defaultConfig: {
    prompt: "",
    required: true,
    rows: ["Statement 1", "Statement 2"],
    columns: ["Disagree", "Neutral", "Agree"],
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      rows: { type: "array", items: { type: "string" } },
      columns: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "rows", "columns"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ values: z.record(z.string(), z.string()) }),
  isAnswerEmpty: (a) => Object.keys(valuesObj(a)).length === 0,
  validateAnswer: (a, c) => {
    const vals = valuesObj(a);
    const cols = Array.isArray(c.columns) ? (c.columns as unknown[]).map(String) : [];
    const rows = Array.isArray(c.rows) ? (c.rows as unknown[]) : [];
    for (const v of Object.values(vals)) if (!cols.includes(String(v))) return false;
    if (c.required === true) {
      return rows.every((_, i) => {
        const x = vals[String(i)];
        return typeof x === "string" && x !== "";
      });
    }
    return true;
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.rows) &&
    c.rows.length > 0 &&
    Array.isArray(c.columns) &&
    c.columns.length > 0,
};

const semanticDifferentialBlock: CoreModuleDef = {
  source: "core",
  key: "semantic-differential",
  version: "1.0.0",
  name: "Semantic differential",
  description: "Bipolar adjective pairs (left vs right) each rated on a 1–N scale.",
  categoryTags: ["measurement", "rating"],
  configSchema: z.object({
    prompt: z.string(),
    required: z.boolean(),
    points: z.number().int().min(2).max(11),
    leftLabels: z.array(z.string()),
    rightLabels: z.array(z.string()),
  }),
  defaultConfig: {
    prompt: "",
    required: true,
    points: 7,
    leftLabels: ["Bad", "Weak"],
    rightLabels: ["Good", "Strong"],
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      points: { type: "integer", minimum: 2, maximum: 11 },
      leftLabels: { type: "array", items: { type: "string" } },
      rightLabels: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "leftLabels", "rightLabels"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ values: z.record(z.string(), z.number()) }),
  isAnswerEmpty: (a) => Object.keys(valuesObj(a)).length === 0,
  validateAnswer: (a, c) => {
    const vals = valuesObj(a);
    const points = typeof c.points === "number" ? c.points : 7;
    for (const v of Object.values(vals)) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > points) return false;
    }
    if (c.required === true) {
      const left = Array.isArray(c.leftLabels) ? c.leftLabels.length : 0;
      const right = Array.isArray(c.rightLabels) ? c.rightLabels.length : 0;
      const pairs = Math.min(left, right);
      for (let i = 0; i < pairs; i++) if (typeof vals[String(i)] !== "number") return false;
    }
    return true;
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.leftLabels) &&
    c.leftLabels.length > 0 &&
    Array.isArray(c.rightLabels) &&
    c.rightLabels.length > 0,
};

// ---------- V1.12 Wave 3 (batch 3): reaction-time + MaxDiff ----------

const reactionTimeBlock: CoreModuleDef = {
  source: "core",
  key: "reaction-time",
  version: "1.0.0",
  name: "Reaction time",
  description: "Measures response latency (ms) after a stimulus appears following a random delay.",
  categoryTags: ["measurement", "behavioral"],
  configSchema: z.object({
    prompt: z.string(),
    stimulus: z.string(),
    minDelayMs: z.number().int().min(0).max(60000),
    maxDelayMs: z.number().int().min(0).max(60000),
  }),
  defaultConfig: {
    prompt: "Press Respond as fast as you can when the word appears.",
    stimulus: "GO",
    minDelayMs: 1000,
    maxDelayMs: 3000,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      stimulus: { type: "string" },
      minDelayMs: { type: "integer" },
      maxDelayMs: { type: "integer" },
    },
    required: ["prompt", "stimulus"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number().min(0) }),
  isAnswerEmpty: (a) => numVal(a) === null,
  validateAnswer: (a) => {
    const v = numVal(a);
    return v !== null && v >= 0;
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    typeof c.stimulus === "string" &&
    c.stimulus.trim().length > 0,
};

const maxDiffBlock: CoreModuleDef = {
  source: "core",
  key: "maxdiff",
  version: "1.0.0",
  name: "MaxDiff (best–worst)",
  description: "Best-worst scaling: from a set of items, pick the best and the worst.",
  categoryTags: ["measurement", "ranking"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean(), items: z.array(z.string()) }),
  defaultConfig: { prompt: "", required: true, items: ["Item 1", "Item 2", "Item 3"] },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      required: { type: "boolean" },
      items: { type: "array", items: { type: "string" } },
    },
    required: ["prompt", "items"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ best: z.string(), worst: z.string() }),
  isAnswerEmpty: (a) => {
    const o = (a ?? {}) as { best?: unknown; worst?: unknown };
    return typeof o.best !== "string" || o.best === "" || typeof o.worst !== "string" || o.worst === "";
  },
  validateAnswer: (a, c) => {
    const o = (a ?? {}) as { best?: unknown; worst?: unknown };
    const items = Array.isArray(c.items) ? (c.items as unknown[]).map(String) : [];
    const best = typeof o.best === "string" ? o.best : "";
    const worst = typeof o.worst === "string" ? o.worst : "";
    if (best === "" && worst === "") return true; // empty handled by required check
    return items.includes(best) && items.includes(worst) && best !== worst;
  },
  isComplete: (c) =>
    typeof c.prompt === "string" &&
    c.prompt.trim().length > 0 &&
    Array.isArray(c.items) &&
    c.items.length >= 2,
};


/* ---------- Wave 1 (2026-06-13): choice & judgment blocks (block-expansion plan) ---------- */

const accuracyConfidenceBlock: CoreModuleDef = {
  source: "core",
  key: "accuracy-confidence",
  version: "1.0.0",
  name: "Accuracy + confidence",
  description:
    "A categorical judgment (e.g. real vs. fake) paired with a confidence rating in one block — the metacognition measure central to misinformation research.",
  categoryTags: ["measurement", "misinformation", "judgment"],
  configSchema: z.object({
    prompt: z.string(),
    options: z.array(z.string()),
    confidenceLabel: z.string(),
    confidenceMax: z.number().int().positive(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "Is this claim accurate?",
    options: ["Accurate", "Inaccurate"],
    confidenceLabel: "How confident are you?",
    confidenceMax: 100,
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      confidenceLabel: { type: "string" },
      confidenceMax: { type: "number" },
      required: { type: "boolean" },
    },
    required: ["prompt", "options"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    accuracy: z.string().max(500),
    confidence: z.number().int().min(0),
  }),
  isAnswerEmpty: (a) => {
    const o = a as { accuracy?: unknown };
    return typeof o?.accuracy !== "string" || o.accuracy.trim() === "";
  },
  validateAnswer: (a, config) => {
    const o = a as { accuracy?: unknown; confidence?: unknown };
    const options = Array.isArray(config.options) ? (config.options as string[]) : [];
    if (typeof o.accuracy === "string" && o.accuracy !== "" && !options.includes(o.accuracy)) return false;
    const max = typeof config.confidenceMax === "number" ? config.confidenceMax : 100;
    if (typeof o.confidence === "number" && (o.confidence < 0 || o.confidence > max)) return false;
    return true;
  },
  isComplete: (c) => Array.isArray(c.options) && (c.options as string[]).length >= 2,
};

const shareIntentionBlock: CoreModuleDef = {
  source: "core",
  key: "share-intention",
  version: "1.0.0",
  name: "Share intention",
  description:
    "Would the participant share this — and why? The behavioral-intention measure for misinformation studies, with an optional or required reason.",
  categoryTags: ["measurement", "misinformation", "behavioral"],
  configSchema: z.object({
    prompt: z.string(),
    options: z.array(z.string()),
    whyPrompt: z.string(),
    whyRequired: z.boolean(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "Would you share this post?",
    options: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"],
    whyPrompt: "Why or why not?",
    whyRequired: false,
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      whyPrompt: { type: "string" },
      whyRequired: { type: "boolean" },
      required: { type: "boolean" },
    },
    required: ["prompt", "options"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    intention: z.string().max(500),
    why: z.string().max(2000).optional(),
  }),
  isAnswerEmpty: (a) => {
    const o = a as { intention?: unknown };
    return typeof o?.intention !== "string" || o.intention.trim() === "";
  },
  validateAnswer: (a, config) => {
    const o = a as { intention?: unknown; why?: unknown };
    const options = Array.isArray(config.options) ? (config.options as string[]) : [];
    if (typeof o.intention === "string" && o.intention !== "" && !options.includes(o.intention)) return false;
    // whyRequired applies only once an intention is chosen.
    if (config.whyRequired === true && typeof o.intention === "string" && o.intention !== "") {
      if (typeof o.why !== "string" || o.why.trim() === "") return false;
    }
    return true;
  },
  isComplete: (c) => Array.isArray(c.options) && (c.options as string[]).length >= 2,
};

const constantSumBlock: CoreModuleDef = {
  source: "core",
  key: "constant-sum",
  version: "1.0.0",
  name: "Constant sum",
  description:
    "Allocate a fixed budget (points or %) across options that must add up to a target. The total is enforced when the block is answered.",
  categoryTags: ["measurement", "allocation"],
  configSchema: z.object({
    prompt: z.string(),
    items: z.array(z.string()),
    total: z.number(),
    unit: z.string(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "Allocate 100 points across these options.",
    items: ["Option 1", "Option 2", "Option 3"],
    total: 100,
    unit: "points",
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      items: { type: "array", items: { type: "string" } },
      total: { type: "number" },
      unit: { type: "string" },
      required: { type: "boolean" },
    },
    required: ["prompt", "items", "total"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    values: z.record(z.string(), z.number()),
  }),
  isAnswerEmpty: (a) => {
    const v = (a as { values?: Record<string, unknown> })?.values ?? {};
    return Object.keys(v).length === 0;
  },
  validateAnswer: (a, config) => {
    const values = ((a as { values?: Record<string, unknown> })?.values ?? {}) as Record<string, unknown>;
    const itemCount = Array.isArray(config.items) ? (config.items as string[]).length : 0;
    let sum = 0;
    for (const [k, raw] of Object.entries(values)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= itemCount) return false; // stray key
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return false; // negative / non-numeric
      sum += n;
    }
    // Enforce the total only when the participant actually allocated something.
    if (Object.keys(values).length > 0) {
      const total = typeof config.total === "number" ? config.total : 100;
      if (Math.abs(sum - total) > 1e-9) return false;
    }
    return true;
  },
  isComplete: (c) =>
    Array.isArray(c.items) && (c.items as string[]).length >= 2 && typeof c.total === "number" && c.total > 0,
};

/** A drill-down option node: a label plus optional dependent children. */
type DrillNode = { label: string; children?: DrillNode[] };
const drillNodeSchema: z.ZodType<DrillNode> = z.lazy(() =>
  z.object({ label: z.string(), children: z.array(drillNodeSchema).optional() }),
);

const drillDownBlock: CoreModuleDef = {
  source: "core",
  key: "drill-down",
  version: "1.0.0",
  name: "Drill down",
  description:
    "Cascading dependent dropdowns (e.g. country → region → city): each level's options depend on the level above. Records the chosen path.",
  categoryTags: ["form", "choice"],
  configSchema: z.object({
    prompt: z.string(),
    levelLabels: z.array(z.string()),
    options: z.array(drillNodeSchema),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "",
    levelLabels: ["Level 1", "Level 2"],
    options: [
      { label: "Group A", children: [{ label: "A1" }, { label: "A2" }] },
      { label: "Group B", children: [{ label: "B1" }, { label: "B2" }] },
    ],
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      levelLabels: { type: "array", items: { type: "string" } },
      options: { type: "array" },
      required: { type: "boolean" },
    },
    required: ["prompt", "options"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ path: z.array(z.string().max(500)) }),
  isAnswerEmpty: (a) => {
    const p = (a as { path?: unknown[] })?.path;
    return !Array.isArray(p) || p.length === 0;
  },
  validateAnswer: (a, config) => {
    const path = (a as { path?: unknown[] })?.path;
    if (!Array.isArray(path)) return false;
    // Walk the configured tree level by level; every step must match a child.
    let nodes = (Array.isArray(config.options) ? config.options : []) as DrillNode[];
    for (const step of path) {
      const match = nodes.find((n) => n.label === step);
      if (!match) return false;
      nodes = match.children ?? [];
    }
    return true;
  },
  isComplete: (c) => Array.isArray(c.options) && (c.options as unknown[]).length > 0,
};

const sideBySideBlock: CoreModuleDef = {
  source: "core",
  key: "side-by-side",
  version: "1.0.0",
  name: "Side by side",
  description:
    "Several sub-questions in one condensed table — each row (item) is rated across multiple columns at once. Columns can differ from each other.",
  categoryTags: ["measurement", "matrix"],
  configSchema: z.object({
    prompt: z.string(),
    rows: z.array(z.string()),
    columns: z.array(z.object({ key: z.string(), label: z.string(), options: z.array(z.string()) })),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "",
    rows: ["Item 1", "Item 2"],
    columns: [
      { key: "quality", label: "Quality", options: ["Low", "Medium", "High"] },
      { key: "trust", label: "Trust", options: ["Low", "Medium", "High"] },
    ],
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      rows: { type: "array", items: { type: "string" } },
      columns: { type: "array" },
      required: { type: "boolean" },
    },
    required: ["prompt", "rows", "columns"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ values: z.record(z.string(), z.string().max(500)) }),
  isAnswerEmpty: (a) => {
    const v = (a as { values?: Record<string, unknown> })?.values ?? {};
    return Object.values(v).every((x) => x == null || String(x).trim() === "");
  },
  validateAnswer: (a, config) => {
    const values = ((a as { values?: Record<string, unknown> })?.values ?? {}) as Record<string, unknown>;
    const rowCount = Array.isArray(config.rows) ? (config.rows as string[]).length : 0;
    const cols = (Array.isArray(config.columns) ? config.columns : []) as {
      key: string;
      options: string[];
    }[];
    const colByKey = new Map(cols.map((c) => [c.key, c]));
    for (const [cell, val] of Object.entries(values)) {
      const us = cell.indexOf("_");
      if (us < 0) return false;
      const rowIdx = Number(cell.slice(0, us));
      const colKey = cell.slice(us + 1);
      if (!Number.isInteger(rowIdx) || rowIdx < 0 || rowIdx >= rowCount) return false;
      const col = colByKey.get(colKey);
      if (!col) return false;
      if (val !== "" && !col.options.includes(String(val))) return false;
    }
    return true;
  },
  isComplete: (c) =>
    Array.isArray(c.rows) && (c.rows as string[]).length > 0 && Array.isArray(c.columns) && (c.columns as unknown[]).length > 0,
};


/* ---------- Wave 2 (2026-06-13): timing & exposure blocks (ADR-0040) ---------- */

const timedExposureBlock: CoreModuleDef = {
  source: "core",
  key: "timed-exposure",
  version: "1.0.0",
  name: "Timed exposure",
  description:
    "Show a stimulus for exactly N milliseconds, then hide it — the limited-exposure paradigm for memory/misinformation studies. Records the actual display time (client-measured).",
  categoryTags: ["content", "stimulus", "misinformation", "behavioral"],
  configSchema: z.object({
    content: z.string(),
    imageUrl: mediaUrl,
    exposureMs: z.number().int().positive(),
    required: z.boolean(),
  }),
  defaultConfig: { content: "", imageUrl: "", exposureMs: 2000, required: false },
  jsonSchema: {
    type: "object",
    properties: {
      content: { type: "string" },
      imageUrl: { type: "string" },
      exposureMs: { type: "number" },
      required: { type: "boolean" },
    },
    required: ["exposureMs"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ shownMs: z.number().int().min(0) }),
  // Timing telemetry never counts as "blank" — a timing block never blocks progress (ADR-0040).
  isAnswerEmpty: () => false,
  validateAnswer: (a) => {
    const v = (a as { shownMs?: unknown })?.shownMs;
    return v == null || (typeof v === "number" && v >= 0);
  },
  isComplete: (c) => typeof c.exposureMs === "number" && c.exposureMs > 0,
};

const forcedWaitBlock: CoreModuleDef = {
  source: "core",
  key: "forced-wait",
  version: "1.0.0",
  name: "Forced wait",
  description:
    "Disable Continue for N seconds so participants spend a minimum time on a screen. Records how long they actually waited (client-measured).",
  categoryTags: ["content", "instructions", "behavioral"],
  configSchema: z.object({
    content: z.string(),
    waitSeconds: z.number().int().positive(),
    required: z.boolean(),
  }),
  defaultConfig: { content: "Please take a moment to read this carefully.", waitSeconds: 5, required: false },
  jsonSchema: {
    type: "object",
    properties: {
      content: { type: "string" },
      waitSeconds: { type: "number" },
      required: { type: "boolean" },
    },
    required: ["waitSeconds"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ waitedMs: z.number().int().min(0) }),
  isAnswerEmpty: () => false,
  validateAnswer: (a) => {
    const v = (a as { waitedMs?: unknown })?.waitedMs;
    return v == null || (typeof v === "number" && v >= 0);
  },
  isComplete: (c) => typeof c.waitSeconds === "number" && c.waitSeconds > 0,
};


/* ---------- Wave 3 (2026-06-13): image-interaction blocks (ADR-0041) ---------- */

const heatMapBlock: CoreModuleDef = {
  source: "core",
  key: "heat-map",
  version: "1.0.0",
  name: "Heat map",
  description:
    "Participants click anywhere on an image to mark points of interest (e.g. where their eye went on a post). Records normalized coordinates.",
  categoryTags: ["measurement", "media", "behavioral"],
  configSchema: z.object({
    prompt: z.string(),
    imageUrl: mediaUrl,
    maxPoints: z.number().int().positive(),
    required: z.boolean(),
  }),
  defaultConfig: { prompt: "", imageUrl: "", maxPoints: 10, required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, imageUrl: { type: "string" }, maxPoints: { type: "number" }, required: { type: "boolean" } },
    required: ["imageUrl"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).max(100),
  }),
  isAnswerEmpty: (a) => !Array.isArray((a as { points?: unknown[] })?.points) || (a as { points: unknown[] }).points.length === 0,
  validateAnswer: (a, config) => {
    const pts = (a as { points?: unknown[] })?.points;
    if (!Array.isArray(pts)) return false;
    const max = typeof config.maxPoints === "number" ? config.maxPoints : 100;
    return pts.length <= max;
  },
  isComplete: (c) => typeof c.imageUrl === "string" && c.imageUrl.trim() !== "",
};

const hotSpotBlock: CoreModuleDef = {
  source: "core",
  key: "hot-spot",
  version: "1.0.0",
  name: "Hot spot",
  description:
    "Predefined clickable regions on an image — participants select which region(s) apply (e.g. which part of a post is misleading).",
  categoryTags: ["measurement", "media", "choice"],
  configSchema: z.object({
    prompt: z.string(),
    imageUrl: mediaUrl,
    regions: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
        /** Draw a visible outline for the participant? Absent ⇒ true. When false
         *  the region is an invisible-but-clickable zone (ADR-0041 amendment). */
        visible: z.boolean().optional(),
        /** What clicking does (ADR-0043). Absent ⇒ just record the selection. */
        action: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal("record") }),
            z.object({
              type: z.literal("link"),
              url: z
                .string()
                .url()
                .refine((u) => {
                  try {
                    return new URL(u).protocol === "https:";
                  } catch {
                    return false;
                  }
                }, "Link must be a valid https URL"),
            }),
            z.object({ type: z.literal("advance") }),
            z.object({
              type: z.literal("setValue"),
              key: z.string().min(1).max(64).regex(/^[A-Za-z0-9_]+$/),
              value: z.string().max(200),
            }),
          ])
          .optional(),
      }),
    ),
    multiple: z.boolean(),
    required: z.boolean(),
  }),
  defaultConfig: {
    prompt: "",
    imageUrl: "",
    regions: [{ key: "r1", label: "Region 1", x: 0.1, y: 0.1, w: 0.3, h: 0.3 }],
    multiple: false,
    required: true,
  },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, imageUrl: { type: "string" }, regions: { type: "array" }, multiple: { type: "boolean" }, required: { type: "boolean" } },
    required: ["imageUrl", "regions"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    selected: z.array(z.string().max(200)),
    /** setValue action writes (ADR-0043) — key→value. */
    tags: z.record(z.string().max(64), z.string().max(200)).optional(),
  }),
  isAnswerEmpty: (a) => !Array.isArray((a as { selected?: unknown[] })?.selected) || (a as { selected: unknown[] }).selected.length === 0,
  validateAnswer: (a, config) => {
    const sel = (a as { selected?: unknown[] })?.selected;
    if (!Array.isArray(sel)) return false;
    const regions = (Array.isArray(config.regions) ? config.regions : []) as {
      key: string;
      action?: { type?: string; key?: string };
    }[];
    const keys = new Set(regions.map((r) => r.key));
    if (sel.some((k) => !keys.has(String(k)))) return false; // stray region
    if (config.multiple !== true && sel.length > 1) return false;
    // tags (ADR-0043): default-deny — a tag key must be declared by some region
    // whose action is setValue, so a forged client tag can't drive branching.
    const tags = (a as { tags?: unknown })?.tags;
    if (tags !== undefined) {
      if (typeof tags !== "object" || tags === null || Array.isArray(tags)) return false;
      const declared = new Set(
        regions.filter((r) => r.action?.type === "setValue" && r.action.key).map((r) => r.action!.key as string),
      );
      if (Object.keys(tags as Record<string, unknown>).some((k) => !declared.has(k))) return false;
    }
    return true;
  },
  isComplete: (c) => typeof c.imageUrl === "string" && c.imageUrl.trim() !== "" && Array.isArray(c.regions) && (c.regions as unknown[]).length > 0,
};

const graphicSliderBlock: CoreModuleDef = {
  source: "core",
  key: "graphic-slider",
  version: "1.0.0",
  name: "Graphic slider",
  description:
    "Drag a marker along an image to give a position-based rating — a slider with an image track instead of a plain axis.",
  categoryTags: ["measurement", "media", "rating"],
  configSchema: z.object({ prompt: z.string(), imageUrl: mediaUrl, required: z.boolean() }),
  defaultConfig: { prompt: "", imageUrl: "", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, imageUrl: { type: "string" }, required: { type: "boolean" } },
    required: ["imageUrl"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ value: z.number().min(0).max(1) }),
  isAnswerEmpty: (a) => typeof (a as { value?: unknown })?.value !== "number",
  validateAnswer: (a) => {
    const v = (a as { value?: unknown })?.value;
    return v == null || (typeof v === "number" && v >= 0 && v <= 1);
  },
  isComplete: (c) => typeof c.imageUrl === "string" && c.imageUrl.trim() !== "",
};

const signatureBlock: CoreModuleDef = {
  source: "core",
  key: "signature",
  version: "1.0.0",
  name: "Signature",
  description:
    "Capture a drawn signature (e.g. for a consent record). The participant signs on a canvas; the image is stored privately.",
  categoryTags: ["form", "consent"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "Please sign below.", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({ r2Key: z.string().regex(/^resp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(300) }),
  isAnswerEmpty: (a) => typeof (a as { r2Key?: unknown })?.r2Key !== "string" || (a as { r2Key: string }).r2Key === "",
  isComplete: () => true,
};


/* ---------- Wave 4 (2026-06-13): media-upload blocks (ADR-0003 amendment) ---------- */

const fileUploadBlock: CoreModuleDef = {
  source: "core",
  key: "file-upload",
  version: "1.0.0",
  name: "File upload",
  description:
    "Let participants upload a file (PDF, document, spreadsheet, image, zip). Stored privately and served as a download (anti-XSS).",
  categoryTags: ["form", "media"],
  configSchema: z.object({ prompt: z.string(), required: z.boolean() }),
  defaultConfig: { prompt: "Upload a file.", required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    r2Key: z.string().regex(/^resp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(300),
    filename: z.string().max(300).optional(),
  }),
  isAnswerEmpty: (a) => typeof (a as { r2Key?: unknown })?.r2Key !== "string" || (a as { r2Key: string }).r2Key === "",
  isComplete: () => true,
};

const videoRecordBlock: CoreModuleDef = {
  source: "core",
  key: "video-record",
  version: "1.0.0",
  name: "Video recording",
  description:
    "Record a short video response from the participant's camera (with consent). Stored privately; records the clip and its duration.",
  categoryTags: ["measurement", "media", "behavioral"],
  configSchema: z.object({
    prompt: z.string(),
    maxDurationSeconds: z.number().int().min(5).max(300),
    required: z.boolean(),
  }),
  defaultConfig: { prompt: "Record a short video response.", maxDurationSeconds: 60, required: true },
  jsonSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, maxDurationSeconds: { type: "number" }, required: { type: "boolean" } },
    required: ["prompt"],
    additionalProperties: false,
  },
  collectsResponse: true,
  responseSchema: z.object({
    r2Key: z.string().regex(/^resp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/).max(300),
    durationMs: z.number().int().positive().max(3_600_000),
  }),
  isAnswerEmpty: (a) => typeof (a as { r2Key?: unknown })?.r2Key !== "string" || (a as { r2Key: string }).r2Key === "",
  validateAnswer: (a, config) => {
    const ms = (a as { durationMs?: unknown })?.durationMs;
    const max = (typeof config.maxDurationSeconds === "number" ? config.maxDurationSeconds : 60) * 1000 + 3000;
    return ms == null || (typeof ms === "number" && ms <= max);
  },
  isComplete: () => true,
};


/* ---------- Wave 5 (2026-06-13): flow blocks (ADR-0042) ---------- */

const embeddedDataBlock: CoreModuleDef = {
  source: "core",
  key: "embedded-data",
  version: "1.0.0",
  name: "Embedded data",
  description:
    "Capture specific URL parameters (e.g. Prolific PID, condition, source) into the response for panel reconciliation. Default-deny: only the names you list are captured. Not shown to participants.",
  categoryTags: ["flow", "quality"],
  configSchema: z.object({ params: z.array(z.string()) }),
  defaultConfig: { params: ["PROLIFIC_PID"] },
  jsonSchema: {
    type: "object",
    properties: { params: { type: "array", items: { type: "string" } } },
    required: ["params"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: () => true,
};

const endRedirectBlock: CoreModuleDef = {
  source: "core",
  key: "end-redirect",
  version: "1.0.0",
  name: "End redirect",
  description:
    "Send completers back to a recruitment platform (Prolific/SONA) with a completion code. Shown on the completion page as a button — never an automatic redirect.",
  categoryTags: ["flow"],
  configSchema: z.object({
    redirectUrl: z.union([z.string().url(), z.literal("")]),
    completionCode: z.string(),
    buttonLabel: z.string(),
  }),
  defaultConfig: { redirectUrl: "", completionCode: "", buttonLabel: "Return to the study panel" },
  jsonSchema: {
    type: "object",
    properties: { redirectUrl: { type: "string" }, completionCode: { type: "string" }, buttonLabel: { type: "string" } },
    required: [],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
  isComplete: (c) => typeof c.redirectUrl === "string" && c.redirectUrl.trim() !== "",
};

// AI conversation (ADR-0061) — a live chat with Claude given a researcher role +
// context. The full transcript is the answer. Uses the workspace's BYO Anthropic
// key (Settings → AI provider); each assistant turn is server-mediated.
const aiChatBlock: CoreModuleDef = {
  source: "core",
  key: "ai-chat",
  version: "1.0.0",
  name: "AI conversation",
  description:
    "A live chat with an AI (Claude) you give a role + context. The whole transcript is saved as the answer. Uses your workspace's Anthropic key (Settings → AI provider).",
  categoryTags: ["ai", "open-ended"],
  configSchema: z.object({
    role: z.string(),
    context: z.string(),
    openingMessage: z.string(),
    model: z.enum(["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"]),
    maxTurns: z.number().int().min(1).max(50),
  }),
  defaultConfig: {
    role: "",
    context: "",
    openingMessage: "",
    model: "claude-sonnet-4-6",
    maxTurns: 8,
  },
  jsonSchema: {
    type: "object",
    properties: {
      role: { type: "string" },
      context: { type: "string" },
      openingMessage: { type: "string" },
      model: { type: "string" },
      maxTurns: { type: "integer", minimum: 1, maximum: 50 },
    },
    required: ["role"],
    additionalProperties: false,
  },
  collectsResponse: true,
  // The stored answer is the conversation transcript.
  responseSchema: z.object({
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) }))
      .max(200),
  }),
  isAnswerEmpty: (a) =>
    !Array.isArray((a as { messages?: unknown })?.messages) ||
    (a as { messages: unknown[] }).messages.length === 0,
  isComplete: (c) => typeof c.role === "string" && c.role.trim().length > 0,
};

export const MODULE_REGISTRY: CoreModuleDef[] = [
  aiChatBlock,
  npsBlock,
  ratingStarsBlock,
  vasBlock,
  matrixGridBlock,
  semanticDifferentialBlock,
  reactionTimeBlock,
  maxDiffBlock,
  textBlock,
  imageBlock,
  videoBlock,
  linkBlock,
  emailBlock,
  urlBlock,
  numberBlock,
  dateBlock,
  yesNoBlock,
  dropdownBlock,
  phoneBlock,
  addressBlock,
  contactBlock,
  audioRecordBlock,
  fieldGroupBlock,
  accuracyConfidenceBlock,
  shareIntentionBlock,
  constantSumBlock,
  drillDownBlock,
  sideBySideBlock,
  timedExposureBlock,
  forcedWaitBlock,
  heatMapBlock,
  hotSpotBlock,
  graphicSliderBlock,
  signatureBlock,
  fileUploadBlock,
  videoRecordBlock,
  embeddedDataBlock,
  endRedirectBlock,
  pictureChoiceBlock,
  socialPost,
  socialPostV2,
  likert7,
  multipleChoice,
  freeText,
  slider,
  ranking,
  attentionCheck,
  demographics,
];

/** Canonical display id: `core/social-post@1.0.0`. */
export function moduleRef(source: string, key: string, version: string): string {
  return `${source}/${key}@${version}`;
}

const BY_REF = new Map<string, CoreModuleDef>(
  MODULE_REGISTRY.map((m) => [moduleRef(m.source, m.key, m.version), m]),
);

export function getModuleDef(
  source: string,
  key: string,
  version: string,
): CoreModuleDef | undefined {
  return BY_REF.get(moduleRef(source, key, version));
}
