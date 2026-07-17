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

/**
 * Declare a fresh fork's replication intent (ADR-0039; ADR-0101 am. 1 D8).
 *
 * `replicationIntent` is the whole job: `planTemplateKey` derives the Replication
 * Recipe template from it, which is what puts the Recipe's typed fields
 * (originalStudy / targetEffect / samplingPlan / differences) in front of the
 * researcher and files them to the Recipe schema.
 *
 * **It no longer seeds the legacy Recipe SECTIONS**, and that is a bug fix, not a
 * simplification. It used to append `recipe-target-effect` / `recipe-original-result`
 * / `recipe-planned-sample` / `recipe-differences` with **guidance text as their
 * content**. Item ⑤ then added typed fields for the same questions plus a dual
 * read ("typed field wins, else the legacy section") — and the dual read cannot
 * tell a section the researcher wrote from one we pre-filled with a prompt. So a
 * replication nobody had filled in was filing our own instructions to OSF as the
 * researcher's answer: 77-33 (Planned sample) came out as *"Target N and the
 * power analysis that produced it…"*. It also asked every question twice, once
 * as a typed field and once as a section.
 *
 * The dual read still serves what it was written for — studies FROZEN before
 * item ⑤, whose sections are the only place their plan exists. New studies have
 * no seeded sections, so the fallback never fires and an empty field files empty,
 * which is honest.
 *
 * The rule: a fallback must never return content the SYSTEM authored. Guidance
 * belongs in a placeholder or help text — never in a value.
 */
export function injectReplicationRecipe(
  overview: StudyOverview,
  _sourceTitle: string,
  intent: "direct" | "conceptual" | "extension",
): StudyOverview {
  return { ...overview, replicationIntent: intent };
}
