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
    imageUrl: z.union([z.string().url(), z.literal("")]),
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
    imageUrl: z.union([z.string().url(), z.literal("")]),
    shareCountVisible: z.boolean(),
  }),
  defaultConfig: {
    headline: "",
    body: "",
    source: "",
    veracityGroundTruth: "unverified",
    topicTags: [],
    imageUrl: "",
    shareCountVisible: false,
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
    },
    required: ["headline", "source", "veracityGroundTruth"],
    additionalProperties: false,
  },
  collectsResponse: false,
  responseSchema: null,
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
    url: z.union([z.string().url(), z.literal("")]),
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
    url: z.union([z.string().url(), z.literal("")]),
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

export const MODULE_REGISTRY: CoreModuleDef[] = [
  npsBlock,
  ratingStarsBlock,
  vasBlock,
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
