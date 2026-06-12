import {
  blockDisplay,
  readBlocks,
  readGroups,
  type BlockInstance,
  type StudyGroup,
} from "@/server/modules/blocks";

/**
 * Conservative proposal merge (ADR-0036): apply a proposal's added + changed
 * blocks onto the target's CURRENT working blocks, aligned by the fork-
 * preserved instanceId. Deliberately never deletes — blocks the proposal
 * removed stay in the target (surfaced in the preview as "not applied").
 * Overview/theme/consent are NOT merged (the narrative belongs to the owner).
 * Pure + deterministic.
 */
export type MergePreview = {
  added: number;
  updated: number;
  /** Blocks the proposal removed — applied only when the owner opts in
   *  per block (ADR-0036 amendment 2026-06-12). */
  deletions: { instanceId: string; name: string }[];
};

const sameBlock = (a: BlockInstance, b: BlockInstance): boolean =>
  JSON.stringify({ ...a, instanceId: "" }) === JSON.stringify({ ...b, instanceId: "" });

export function mergeProposal(
  targetSnapshot: unknown,
  proposedSnapshot: unknown,
  /** instanceIds of proposal-removed blocks the owner chose to remove too. */
  applyDeletions: string[] = [],
): { blocks: BlockInstance[]; groups: StudyGroup[]; preview: MergePreview } {
  const target = readBlocks(targetSnapshot);
  const proposal = readBlocks(proposedSnapshot);
  const targetById = new Map(target.map((b) => [b.instanceId, b]));
  const proposalById = new Map(proposal.map((b) => [b.instanceId, b]));

  let added = 0;
  let updated = 0;

  // Updates: blocks in both take the proposal's version, keeping the target's position.
  let result: BlockInstance[] = target.map((b) => {
    const p = proposalById.get(b.instanceId);
    if (p && !sameBlock(p, b)) {
      updated += 1;
      return p;
    }
    return b;
  });

  // Additions: walk the proposal in order; insert each new block after its
  // nearest preceding proposal-neighbor already present in the result, so the
  // proposer's intended placement survives.
  for (let i = 0; i < proposal.length; i++) {
    const p = proposal[i];
    if (targetById.has(p.instanceId)) continue;
    if (result.some((b) => b.instanceId === p.instanceId)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = result.findIndex((b) => b.instanceId === proposal[j].instanceId);
      if (idx !== -1) {
        at = idx + 1;
        break;
      }
    }
    result.splice(at, 0, p);
    added += 1;
  }

  // Groups: keep the target's; bring proposal groups that merged blocks now
  // reference (minus moduleId — a workspace-local link, same rule as fork).
  const targetGroups = readGroups(targetSnapshot);
  const have = new Set(targetGroups.map((g) => g.id));
  const referenced = new Set(result.map((b) => b.groupId).filter(Boolean) as string[]);
  const broughtIn = readGroups(proposedSnapshot)
    .filter((g) => referenced.has(g.id) && !have.has(g.id))
    .map(({ moduleId: _drop, ...g }) => g);

  const deletions = target
    .filter((b) => !proposalById.has(b.instanceId))
    .map((b) => ({
      instanceId: b.instanceId,
      name: (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name,
    }));

  // Owner-selected deletions (only legit candidates count), then drop any
  // show-if clause that referenced a removed block so nothing dangles.
  const removable = new Set(deletions.map((d) => d.instanceId));
  const toRemove = new Set(applyDeletions.filter((id) => removable.has(id)));
  if (toRemove.size) {
    result = result.filter((b) => !toRemove.has(b.instanceId));
    const present = new Set(result.map((b) => b.instanceId));
    result = result.map((b) => {
      if (!b.showIf) return b;
      const clauses = b.showIf.clauses.filter((c) => present.has(c.fromInstanceId));
      if (clauses.length === b.showIf.clauses.length) return b;
      const { showIf: _drop, ...rest } = b;
      return clauses.length ? { ...rest, showIf: { ...b.showIf, clauses } } : rest;
    });
  }

  return {
    blocks: result,
    groups: [...targetGroups, ...broughtIn],
    preview: { added, updated, deletions },
  };
}
