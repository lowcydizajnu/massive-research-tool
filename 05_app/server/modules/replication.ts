import {
  alignBlocksForDiff,
  blockDisplay,
  readBlocks,
  type BlockInstance,
  type StudyOverview,
} from "@/server/modules/blocks";

/**
 * Replication mode helpers (ADR-0039). Divergence is derived on read against
 * the version PINNED at fork time (fork_of_version_id, ADR-0018) — never
 * stored, so badges can't go stale. Pure functions.
 */
export type DivergenceStatus = "modified" | "added";

const nameOf = (b: BlockInstance): string =>
  (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name;

const stable = (b: BlockInstance): string =>
  JSON.stringify({ ...b, instanceId: "", divergenceNote: "" });

/** Per-block divergence of a fork's tip vs the pinned source snapshot. */
export function divergenceAgainstPinned(
  tipSnapshot: unknown,
  pinnedSnapshot: unknown,
): {
  badges: Record<string, DivergenceStatus>;
  removedCount: number;
  diverged: { instanceId: string; name: string; status: DivergenceStatus; hasNote: boolean }[];
} {
  const tip = readBlocks(tipSnapshot);
  const pinned = readBlocks(pinnedSnapshot);
  // Content-align in case ids were regenerated somewhere along the lineage.
  const { aligned } = alignBlocksForDiff(pinned, tip);
  const pinnedById = new Map(pinned.map((b) => [b.instanceId, b]));
  const alignedById = new Map(aligned.map((b, i) => [tip[i]?.instanceId ?? b.instanceId, b]));

  const badges: Record<string, DivergenceStatus> = {};
  const diverged: { instanceId: string; name: string; status: DivergenceStatus; hasNote: boolean }[] = [];
  for (const b of tip) {
    const alignedSelf = alignedById.get(b.instanceId) ?? b;
    const original = pinnedById.get(alignedSelf.instanceId);
    const status: DivergenceStatus | null = !original
      ? "added"
      : stable(original) !== stable(alignedSelf)
        ? "modified"
        : null;
    if (status) {
      badges[b.instanceId] = status;
      diverged.push({
        instanceId: b.instanceId,
        name: nameOf(b),
        status,
        hasNote: typeof b.divergenceNote === "string" && b.divergenceNote.trim().length > 0,
      });
    }
  }
  const tipIds = new Set(aligned.map((b) => b.instanceId));
  const removedCount = pinned.filter((b) => !tipIds.has(b.instanceId)).length;
  return { badges, removedCount, diverged };
}

/** Replication Recipe sections (Brandt et al., 2014 — see the literature note)
 *  injected into a fresh fork's Overview. Researcher-editable like any section. */
export function injectReplicationRecipe(
  overview: StudyOverview,
  sourceTitle: string,
  intent: "direct" | "conceptual" | "extension",
): StudyOverview {
  const have = new Set(overview.sections.map((x) => x.id));
  const recipe = [
    {
      id: "recipe-target-effect",
      heading: "Target effect",
      contentMd: `Replicating **${sourceTitle}** (${intent} replication). Define the effect being replicated, with the original's key statistics.`,
    },
    {
      id: "recipe-original-result",
      heading: "Original result",
      contentMd: "Original effect size, sample, and analysis (cite the paper / OSF page).",
    },
    {
      id: "recipe-planned-sample",
      heading: "Planned sample",
      contentMd: "Target N and the power analysis that produced it (aim for high power on the ORIGINAL effect size).",
    },
    {
      id: "recipe-differences",
      heading: "Differences from the original",
      contentMd: "Documented per block as you edit (the rationale field on each diverged block) — summarize anything protocol-wide here.",
    },
  ].filter((x) => !have.has(x.id));
  return { ...overview, replicationIntent: intent, sections: [...overview.sections, ...recipe] };
}
