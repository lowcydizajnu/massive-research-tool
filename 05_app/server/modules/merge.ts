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
  /** Blocks the proposal removed — listed, never auto-applied. */
  deletionsNotApplied: string[];
};

const sameBlock = (a: BlockInstance, b: BlockInstance): boolean =>
  JSON.stringify({ ...a, instanceId: "" }) === JSON.stringify({ ...b, instanceId: "" });

export function mergeProposal(
  targetSnapshot: unknown,
  proposedSnapshot: unknown,
): { blocks: BlockInstance[]; groups: StudyGroup[]; preview: MergePreview } {
  const target = readBlocks(targetSnapshot);
  const proposal = readBlocks(proposedSnapshot);
  const targetById = new Map(target.map((b) => [b.instanceId, b]));
  const proposalById = new Map(proposal.map((b) => [b.instanceId, b]));

  let added = 0;
  let updated = 0;

  // Updates: blocks in both take the proposal's version, keeping the target's position.
  const result: BlockInstance[] = target.map((b) => {
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

  const deletionsNotApplied = target
    .filter((b) => !proposalById.has(b.instanceId))
    .map((b) => (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name);

  return {
    blocks: result,
    groups: [...targetGroups, ...broughtIn],
    preview: { added, updated, deletionsNotApplied },
  };
}
