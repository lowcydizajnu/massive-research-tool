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
  isComplete: (c) => typeof c.prompt === "string" && c.prompt.trim().length > 0,
};

export const MODULE_REGISTRY: CoreModuleDef[] = [socialPost, likert7];

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
