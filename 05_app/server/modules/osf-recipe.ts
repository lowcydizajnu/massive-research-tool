import { blockDisplay, readBlocks, readOverview, type StudyOverview, type VariableRole } from "@/server/modules/blocks";
import { protocolText } from "@/server/modules/protocol-text";

const ROLE_LABEL: Record<VariableRole, string> = {
  iv: "Independent",
  dv: "Dependent",
  covariate: "Covariate",
  exclusion: "Exclusion",
};

/**
 * Typed `variables[]` rendered for OSF (ADR-0101). Neither of the two schemas we
 * file has a verified response key for variables, so we do NOT invent one — this
 * composes into the description body / Open-Ended summary instead. Resolves each
 * variable's measuring block to its researcher-facing name when linked.
 */
function variablesText(ov: StudyOverview, snapshot: unknown): string | undefined {
  const rows = ov.variables.filter((v) => v.name.trim());
  if (!rows.length) return undefined;
  const byId = new Map(
    readBlocks(snapshot).map((b) => [
      b.instanceId,
      (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name,
    ]),
  );
  return rows
    .map((v) => {
      const measure = v.instanceId ? byId.get(v.instanceId) : undefined;
      const bits = [ROLE_LABEL[v.role], measure ? `measured by "${measure}"` : null, v.notes.trim() || null]
        .filter(Boolean)
        .join("; ");
      return `- ${v.name.trim()} (${bits})`;
    })
    .join("\n");
}

/** Typed `expectedOutcomes[]` rendered for OSF (ADR-0101). Same no-verified-key caveat. */
function expectedOutcomesText(ov: StudyOverview): string | undefined {
  const rows = ov.expectedOutcomes.filter((o) => o.prediction.trim());
  if (!rows.length) return undefined;
  return rows
    .map((o) => `- ${o.hypothesisIndex ? `H${o.hypothesisIndex}: ` : ""}${o.prediction.trim()}`)
    .join("\n");
}

/**
 * Sampling plan for OSF: the typed field wins, else the legacy seeded section
 * (ADR-0101 dual read). Studies frozen before item ⑤ only have the section, and
 * we never silently migrate their text into the typed field.
 */
function samplingPlanText(ov: StudyOverview, snapshot: unknown): string {
  return ov.samplingPlan.text.trim() || section(snapshot, "recipe-planned-sample");
}

/** Analysis plan for OSF: typed field wins, else the legacy heading-matched section. */
function analysisPlanText(ov: StudyOverview): string {
  return (
    ov.analysisPlan.text.trim() ||
    ov.sections.find((s) => /analysis/i.test(s.heading))?.contentMd.trim() ||
    ""
  );
}

/**
 * Replication Recipe registration mapping (ADR-0005 amendment 3 / ADR-0039).
 * Response keys verified LIVE against api.osf.io on 2026-06-12 — schema
 * "Replication Recipe (Brandt et al., 2014): Pre-Registration"
 * (id 64b14a08d639e5000d2013a5, version 2); every field is optional there, so
 * we file what we hold and the researcher completes the rest on OSF.
 */
export const RECIPE_SCHEMA_NAME = "Replication Recipe (Brandt et al., 2014): Pre-Registration";

/**
 * Standard AI non-determinism disclosure (ADR-0061 amendment 1). Auto-appended
 * to the registration body when the study contains an AI conversation block, so
 * the registered plan states that the AI step isn't reproducible like a fixed
 * questionnaire. Returns undefined when there's no AI block.
 */
export function aiNonDeterminismDisclosure(snapshot: unknown): string | undefined {
  const n = readBlocks(snapshot).filter((b) => b.key === "ai-chat").length;
  if (n === 0) return undefined;
  return (
    `AI CONVERSATION — NON-DETERMINISM DISCLOSURE\n` +
    `This study includes ${n} AI conversation step${n === 1 ? "" : "s"} in which the participant ` +
    `talks with a large language model given a researcher-defined role and context. The AI's ` +
    `wording varies between participants, so this step is not reproducible in the way a fixed ` +
    `questionnaire is. The plan fixes the AI's role, context, model, and turn limit; the record ` +
    `for each participant is the saved transcript itself, not a predetermined script.`
  );
}

/**
 * Says which variables were read from the built study rather than written by the
 * researcher (ADR-0106 D5). Without it a derived variable files to OSF exactly
 * like a hand-declared one — `variablesText` reads `.name`/`.role` and never
 * looks at `.source` — so the filing would overclaim authorship.
 *
 * Default ON because it is honest, and because "read from the design" is a
 * stronger provenance claim than a typed sentence, not a weaker one. Opt-out
 * (`discloseDerivation`) because it is the researcher's filing — owner
 * direction 2026-07-16. Silent when nothing was derived: we never claim it.
 *
 * Deliberately does NOT say the role was derived — the role is intent, and
 * intent is always the researcher's (`design-facts.ts` never-derive set).
 */
export function derivationDisclosure(ov: StudyOverview, snapshot: unknown): string | undefined {
  if (!ov.discloseDerivation) return undefined;
  const derived = ov.variables.filter((v) => v.source === "derived" && v.name.trim());
  if (!derived.length) return undefined;
  const byId = new Map(
    readBlocks(snapshot).map((b) => [
      b.instanceId,
      (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name,
    ]),
  );
  const named = derived.map((v) => {
    const measure = v.instanceId ? byId.get(v.instanceId) : undefined;
    return measure ? `${v.name.trim()} (from "${measure}")` : v.name.trim();
  });
  return (
    `HOW THIS PLAN WAS PREPARED\n` +
    `${named.length === 1 ? "One variable was" : `${named.length} variables were`} read automatically ` +
    `from this study as built in My Research Lab, and ${named.length === 1 ? "is" : "are"} linked to the ` +
    `step that measures ${named.length === 1 ? "it" : "them"}: ${named.join("; ")}. ` +
    `What each one means — its role in the analysis — was decided by the researcher, as was the rest of this plan.`
  );
}

/**
 * Human-readable design for the default Open-Ended OSF summary (audit step 3):
 * abstract + numbered hypotheses + the clean protocol, so OSF shows real app
 * content above the machine JSON. Returns undefined when there's nothing to say.
 */
export function buildOpenEndedBody(snapshot: unknown): string | undefined {
  const ov = readOverview(snapshot);
  const parts: string[] = [];
  if (ov.abstract.trim()) parts.push(`ABSTRACT\n${ov.abstract.trim()}`);
  const hyps = ov.hypotheses.filter((h) => h.trim());
  if (hyps.length) parts.push(`HYPOTHESES\n${hyps.map((h, i) => `${i + 1}. ${h.trim()}`).join("\n")}`);
  // Typed plan fields (ADR-0101). Open-Ended has exactly one free-text answer, so
  // the structure we now hold is expressed as labelled sections of that summary.
  const sampling = samplingPlanText(ov, snapshot);
  if (sampling) parts.push(`SAMPLING PLAN\n${sampling}`);
  const vars = variablesText(ov, snapshot);
  if (vars) parts.push(`VARIABLES\n${vars}`);
  const outcomes = expectedOutcomesText(ov);
  if (outcomes) parts.push(`EXPECTED OUTCOMES\n${outcomes}`);
  const analysis = analysisPlanText(ov);
  if (analysis) parts.push(`ANALYSIS PLAN\n${analysis}`);
  const protocol = protocolText(snapshot);
  if (protocol.length) parts.push(`PROTOCOL\n${protocol.join("\n")}`);
  const ai = aiNonDeterminismDisclosure(snapshot);
  if (ai) parts.push(ai);
  const derived = derivationDisclosure(ov, snapshot);
  if (derived) parts.push(derived);
  return parts.length ? parts.join("\n\n") : undefined;
}

const KEYS = {
  description: "77-2",
  originalStudy: "77-12",
  sampleSizeTarget: "77-33",
  differences: "77-73",
  analysisPlan: "77-80",
} as const;

function section(snapshot: unknown, id: string): string {
  return (
    readOverview(snapshot)
      .sections.find((s) => s.id === id)
      ?.contentMd.trim() ?? ""
  );
}

export function buildRecipeResponses(opts: {
  snapshot: unknown;
  sourceTitle?: string | null;
  sourceAuthor?: string | null;
  amendmentHeader?: string;
}): Record<string, string> {
  const { snapshot, sourceTitle, sourceAuthor, amendmentHeader } = opts;
  const overview = readOverview(snapshot);
  const out: Record<string, string> = {};

  // Typed field wins, legacy seeded section is the fallback (ADR-0101 dual read).
  const target = overview.targetEffect.text.trim() || section(snapshot, "recipe-target-effect");
  const protocol = protocolText(snapshot).join("\n");
  // Variables + expected outcomes have no verified Recipe response key, so they
  // ride in the description rather than being invented into one (ADR-0101).
  const vars = variablesText(overview, snapshot);
  const outcomes = expectedOutcomesText(overview);
  out[KEYS.description] = [
    amendmentHeader,
    target,
    overview.abstract.trim(),
    vars ? `VARIABLES\n${vars}` : "",
    outcomes ? `EXPECTED OUTCOMES\n${outcomes}` : "",
    derivationDisclosure(overview, snapshot) ?? "",
    "--- Full protocol (auto-generated by My Research Lab) ---",
    protocol,
  ]
    .filter(Boolean)
    .join("\n\n");

  // The researcher's typed answer wins; a fork falls back to its source study.
  // A non-fork picking the Recipe previously had no way to answer this at all.
  const typedOriginal = overview.originalStudy.text.trim();
  if (typedOriginal) {
    out[KEYS.originalStudy] = typedOriginal;
  } else if (sourceTitle) {
    out[KEYS.originalStudy] = `${sourceTitle}${sourceAuthor ? ` (${sourceAuthor})` : ""}`;
  }

  const planned = samplingPlanText(overview, snapshot);
  if (planned) out[KEYS.sampleSizeTarget] = planned.slice(0, 1000);

  // Per-block rationales + the researcher's differences section.
  const notes = readBlocks(snapshot)
    .filter((b) => typeof b.divergenceNote === "string" && b.divergenceNote.trim())
    .map((b) => `- ${(typeof b.title === "string" && b.title.trim()) || b.key}: ${b.divergenceNote!.trim()}`);
  const diffText = overview.differences.text.trim() || section(snapshot, "recipe-differences");
  const differences = [diffText, ...notes].filter(Boolean).join("\n");
  if (differences) out[KEYS.differences] = differences;

  const analysis = analysisPlanText(overview);
  if (analysis) out[KEYS.analysisPlan] = analysis;

  return out;
}
