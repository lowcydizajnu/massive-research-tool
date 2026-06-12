import {
  blockDisplay,
  readBlocks,
  readOverview,
  type BlockInstance,
} from "@/server/modules/blocks";
import { hasCustomConsent } from "@/server/modules/consent";
import { getModuleDef } from "@/server/modules/registry";

/**
 * Methodological pre-flight checks (ADR-0034, GitHub-backlog item 2 — "CI
 * checks", framed researcher-native as readiness linting). Pure: snapshot +
 * conditions in, checks out. The gate is advisory-with-friction — the UI
 * disables Preregister/Publish on failures unless the researcher explicitly
 * proceeds; mutations never enforce (researcher autonomy).
 */
export type PreflightStatus = "pass" | "warn" | "fail";

export type PreflightCheck = {
  id: string;
  status: PreflightStatus;
  title: string;
  detail?: string;
  /** Offending blocks, for "Fix in Build →" links. */
  blocks?: { instanceId: string; name: string }[];
};

export type PreflightMode = "preregister" | "publish";

const nameOf = (b: BlockInstance): string =>
  (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name;

export function runPreflight(opts: {
  snapshot: unknown;
  conditions: { slug: string; name: string }[];
  mode: PreflightMode;
}): PreflightCheck[] {
  const { snapshot, conditions, mode } = opts;
  const blocks = readBlocks(snapshot);
  const overview = readOverview(snapshot);
  const out: PreflightCheck[] = [];

  // has-blocks
  out.push(
    blocks.length > 0
      ? { id: "has-blocks", status: "pass", title: `${blocks.length} block${blocks.length === 1 ? "" : "s"} in the protocol` }
      : { id: "has-blocks", status: "fail", title: "The study has no blocks", detail: "Add at least one block in Build before freezing a version." },
  );

  // blocks-configured (per-module isComplete)
  const incomplete = blocks.filter((b) => {
    const def = getModuleDef(b.source, b.key, b.version);
    return def ? !def.isComplete(b.config) : false;
  });
  out.push(
    incomplete.length === 0
      ? { id: "blocks-configured", status: "pass", title: "Every block is configured" }
      : {
          id: "blocks-configured",
          status: "fail",
          title: `${incomplete.length} block${incomplete.length === 1 ? " isn't" : "s aren't"} configured yet`,
          detail: "Participants would see incomplete questions.",
          blocks: incomplete.map((b) => ({ instanceId: b.instanceId, name: nameOf(b) })),
        },
  );

  // branching-valid: every showIf clause references an existing, EARLIER block.
  const index = new Map(blocks.map((b, i) => [b.instanceId, i]));
  const badBranching = blocks.filter((b, i) => {
    const clauses = b.showIf?.clauses ?? [];
    return clauses.some((c) => {
      const ref = index.get(c.fromInstanceId);
      return ref === undefined || ref >= i;
    });
  });
  out.push(
    badBranching.length === 0
      ? { id: "branching-valid", status: "pass", title: "Branching rules are valid" }
      : {
          id: "branching-valid",
          status: "fail",
          title: `${badBranching.length} block${badBranching.length === 1 ? " has" : "s have"} a broken show-if rule`,
          detail: "A rule points at a block that was removed or comes later in the study.",
          blocks: badBranching.map((b) => ({ instanceId: b.instanceId, name: nameOf(b) })),
        },
  );

  // records-data
  const collecting = blocks.filter((b) => getModuleDef(b.source, b.key, b.version)?.collectsResponse);
  out.push(
    collecting.length > 0
      ? { id: "records-data", status: "pass", title: `${collecting.length} block${collecting.length === 1 ? "" : "s"} record${collecting.length === 1 ? "s" : ""} data` }
      : {
          id: "records-data",
          status: "warn",
          title: "No block records a response",
          detail: "Participants can take the study, but Results and the export will be empty.",
        },
  );

  // hypotheses (mode-aware severity)
  const hCount = overview.hypotheses.filter((h) => h.trim()).length;
  out.push(
    hCount > 0
      ? { id: "hypotheses", status: "pass", title: `${hCount} hypothesis${hCount === 1 ? "" : "es"} in the Overview` }
      : {
          id: "hypotheses",
          status: mode === "preregister" ? "fail" : "warn",
          title: "No hypotheses in the Overview",
          detail:
            mode === "preregister"
              ? "A preregistration without hypotheses is unusual — add them in Overview, or proceed if this is intentionally exploratory."
              : "Fine for exploratory pilots; add them in Overview if this study tests predictions.",
        },
  );

  // abstract (preregister only)
  if (mode === "preregister") {
    out.push(
      overview.abstract.trim()
        ? { id: "abstract", status: "pass", title: "Overview has an abstract" }
        : {
            id: "abstract",
            status: "warn",
            title: "Overview abstract is empty",
            detail: "The abstract becomes part of the registration record.",
          },
    );
  }

  // attention-check on long studies
  if (collecting.length > 10) {
    const hasAttention = blocks.some((b) => b.key === "attention-check");
    out.push(
      hasAttention
        ? { id: "attention-check", status: "pass", title: "Long study has an attention check" }
        : {
            id: "attention-check",
            status: "warn",
            title: `${collecting.length} questions but no attention check`,
            detail: "Long studies without one make low-effort responding hard to detect.",
          },
    );
  }

  // conditions-used: beyond a lone default arm, every condition should gate something.
  if (conditions.length > 1) {
    const unused = conditions.filter(
      (c) => !blocks.some((b) => (b.visibility?.showIfCondition ?? []).includes(c.slug)),
    );
    out.push(
      unused.length === 0
        ? { id: "conditions-used", status: "pass", title: "Every condition shows different content" }
        : {
            id: "conditions-used",
            status: "warn",
            title: `${unused.length} condition${unused.length === 1 ? "" : "s"} show${unused.length === 1 ? "s" : ""} nothing different`,
            detail: `Participants in ${unused.map((c) => `"${c.name}"`).join(", ")} see exactly what everyone sees — is the manipulation wired up?`,
          },
    );
  }

  // consent — informational: the consent step always exists (ADR-0035).
  out.push(
    hasCustomConsent(snapshot)
      ? {
          id: "consent",
          status: "pass",
          title: "Custom consent screen",
          detail: "Participants see your consent text and Agree / Disagree before the first question.",
        }
      : {
          id: "consent",
          status: "pass",
          title: "Consent step is built in (default text)",
          detail: "Click the pinned Consent screen card in Build to use your own wording.",
        },
  );

  return out;
}

export function preflightSummary(checks: PreflightCheck[]): { fails: number; warns: number } {
  return {
    fails: checks.filter((c) => c.status === "fail").length,
    warns: checks.filter((c) => c.status === "warn").length,
  };
}
