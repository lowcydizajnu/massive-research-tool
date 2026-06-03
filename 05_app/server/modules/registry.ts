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
  // Shape only — the participant UI constrains values to the options + single
  // vs multi; server-side option-membership validation is a hardening follow-up.
  responseSchema: z.object({ selected: z.array(z.string()) }),
  isAnswerEmpty: (a) => !Array.isArray((a as { selected?: unknown })?.selected) || (a as { selected: unknown[] }).selected.length === 0,
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
  responseSchema: z.object({ text: z.string() }),
  isAnswerEmpty: (a) => typeof (a as { text?: unknown })?.text !== "string" || (a as { text: string }).text.trim().length === 0,
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

export const MODULE_REGISTRY: CoreModuleDef[] = [
  socialPost,
  socialPostV2,
  likert7,
  multipleChoice,
  freeText,
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
