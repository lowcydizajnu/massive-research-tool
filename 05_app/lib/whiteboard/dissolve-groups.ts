/**
 * Group dissolve rule (ADR-0028): a screen-group needs ≥2 members. The server's
 * `studies.setGroups` enforces this — any group that falls to 1 (or 0) members is
 * dissolved (its lone member becomes a normal block). The Builder's OPTIMISTIC
 * cache update must apply the SAME rule, or it briefly shows a phantom 1-member
 * group that the server immediately dissolves; that phantom then gets captured
 * into undo history and replaying it "blinks green then reverts to ungrouped"
 * (feedback 01KW943Q). Keeping this pure + shared makes client and server agree.
 */

/** Apply the ≥2-member rule to a blocks+groups pair. Blocks whose group fell
 *  below 2 members get `groupId: null`; `groups` is filtered to the survivors.
 *  Generic over the block shape so both the read (StudyBlock) and write
 *  (BlockInstance) callers can use it. */
export function dissolveSmallGroups<
  B extends { groupId?: string | null },
  G extends { id: string },
>(blocks: B[], groups: G[]): { blocks: B[]; groups: G[] } {
  const counts = new Map<string, number>();
  for (const b of blocks) if (b.groupId) counts.set(b.groupId, (counts.get(b.groupId) ?? 0) + 1);
  const dissolve = new Set([...counts].filter(([, n]) => n < 2).map(([id]) => id));

  const nextBlocks =
    dissolve.size === 0
      ? blocks
      : blocks.map((b) => (b.groupId && dissolve.has(b.groupId) ? { ...b, groupId: null } : b));

  const used = new Set(nextBlocks.map((b) => b.groupId).filter(Boolean) as string[]);
  const nextGroups = groups.filter((g) => used.has(g.id));
  return { blocks: nextBlocks, groups: nextGroups };
}
