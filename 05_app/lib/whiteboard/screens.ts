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
/**
 * After a drag-reorder, recompute the moved block's group + keep groups
 * contiguous (ADR-0028 grouping #3 + #8). Drop neighbors decide membership:
 * dropped *between two members of the same group* → joins it; a member dragged
 * away from its group (neither neighbor in it) → leaves; otherwise it stays.
 * Then each group's members are pulled together at their first occurrence, so
 * moving any member carries the whole group. Pure; `blocks` is the new order.
 */
export function regroupAfterMove(
  blocks: { instanceId: string; groupId: string | null }[],
  movedId: string,
): { instanceId: string; groupId: string | null }[] {
  const idx = blocks.findIndex((b) => b.instanceId === movedId);
  if (idx === -1) return blocks;
  const prev = blocks[idx - 1]?.groupId ?? null;
  const next = blocks[idx + 1]?.groupId ?? null;
  const was = blocks[idx].groupId;
  let g: string | null = null;
  if (prev && next && prev === next) g = prev; // dropped inside a group
  else if (was && (prev === was || next === was)) g = was; // stayed adjacent to its group
  return makeContiguous(blocks.map((b) => (b.instanceId === movedId ? { ...b, groupId: g } : b)));
}

/** Reorder so each group's members are consecutive (at the group's first
 *  occurrence). Pure; preserves relative order within a group + among singles. */
export function makeContiguous<T extends { instanceId: string; groupId: string | null }>(blocks: T[]): T[] {
  const out: T[] = [];
  const emitted = new Set<string>();
  for (const b of blocks) {
    if (emitted.has(b.instanceId)) continue;
    if (b.groupId) {
      for (const m of blocks) {
        if (m.groupId === b.groupId && !emitted.has(m.instanceId)) {
          out.push(m);
          emitted.add(m.instanceId);
        }
      }
    } else {
      out.push(b);
      emitted.add(b.instanceId);
    }
  }
  return out;
}

/** Set one block's group to an explicit target (or null to ungroup) — used by
 *  whiteboard drag-into/out-of a container — then re-make groups contiguous so
 *  the joined block sits with its group (ADR-0028 amendment). Pure. */
export function setBlockGroup<T extends { instanceId: string; groupId: string | null }>(
  blocks: T[],
  blockId: string,
  groupId: string | null,
): T[] {
  return makeContiguous(blocks.map((b) => (b.instanceId === blockId ? { ...b, groupId } : b)));
}

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
