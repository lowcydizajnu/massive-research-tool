import type { ConditionGroup } from "@/lib/whiteboard/conditions";
import type { BlockInstance, StudyGroup } from "@/server/modules/blocks";

/**
 * A participant screen (ADR-0028) — the runtime's unit of navigation. Either a
 * question group (several blocks shown together) or a single ungrouped block.
 * Derived purely from the flat block list + group metadata; no groups present →
 * one screen per block (fully backward-compatible with the pre-grouping runtime).
 */
export type Screen = {
  /** Group id for a group screen; the block's instanceId for a single. */
  id: string;
  kind: "group" | "single";
  title: string | null;
  /** Screen-level condition (group's showIf, or the lone block's showIf). */
  showIf?: ConditionGroup;
  blocks: BlockInstance[];
};

/**
 * Collapse the ordered block list into screens: a run of CONTIGUOUS blocks that
 * share a known `groupId` becomes one group screen; every other block is its
 * own single screen. A `groupId` pointing at no known group degrades to single
 * (safe). Pure + deterministic; preserves block order.
 */
export function deriveScreens(blocks: BlockInstance[], groups: StudyGroup[]): Screen[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const screens: Screen[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const gid = b.groupId;
    if (gid && groupById.has(gid)) {
      const members: BlockInstance[] = [];
      while (i < blocks.length && blocks[i].groupId === gid) {
        members.push(blocks[i]);
        i += 1;
      }
      const g = groupById.get(gid)!;
      screens.push({ id: gid, kind: "group", title: g.title ?? null, showIf: g.showIf, blocks: members });
    } else {
      screens.push({ id: b.instanceId, kind: "single", title: null, showIf: b.showIf, blocks: [b] });
      i += 1;
    }
  }
  return screens;
}
