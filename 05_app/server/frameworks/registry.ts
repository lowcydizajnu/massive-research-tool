/**
 * In-repo framework registry (V1) — curated starting kits a study can begin
 * from. Per data-model/03-framework-entities.md, DB-backed Framework entities
 * are deferred until curator authoring exists; V1 ships built-ins here.
 *
 * A framework's blocks use the same format as a study's (ADR-0012), so
 * "create from framework" is a copy-with-new-ULIDs into the new study's
 * autosave version. Preset configs must satisfy the module schemas (registry).
 */
export type FrameworkBlockDef = {
  source: string;
  key: string;
  version: string;
  config: Record<string, unknown>;
};

export type FrameworkDef = {
  key: string;
  name: string;
  description: string;
  blocks: FrameworkBlockDef[];
};

const misinformation: FrameworkDef = {
  key: "misinformation",
  name: "Misinformation Research Framework",
  description:
    "A starting kit for misinformation studies: a social-post stimulus plus a manipulation-check Likert item.",
  blocks: [
    {
      source: "core",
      key: "social-post",
      version: "1.0.0",
      // Stimulus — the researcher supplies the post content.
      config: {
        headline: "",
        body: "",
        source: "",
        imageUrl: "",
        shareCountVisible: true,
      },
    },
    {
      source: "core",
      key: "likert-7",
      version: "1.0.0",
      // Manipulation check — comes pre-worded.
      config: {
        prompt: "How accurate is the claim in the post above?",
        leftAnchor: "Not at all accurate",
        rightAnchor: "Very accurate",
        required: true,
      },
    },
  ],
};

export const FRAMEWORK_REGISTRY: FrameworkDef[] = [misinformation];

export function getFrameworkDef(key: string): FrameworkDef | undefined {
  return FRAMEWORK_REGISTRY.find((f) => f.key === key);
}
