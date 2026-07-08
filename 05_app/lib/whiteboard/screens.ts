import type { ConditionGroup } from "@/lib/whiteboard/conditions";
import type { InteractionRequirement } from "@/lib/whiteboard/interaction-requirements";
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
  /** Screen-level interaction gating (ADR-0087) — group screens only. */
  maxTimeSec?: number;
  interactionRequirements?: InteractionRequirement[];
  /** Show the requirement chips to the participant (ADR-0087 am.). Undefined ⇒
   *  true (the gate still enforces either way; this is just the visible summary). */
  showRequirementSummary?: boolean;
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

/**
 * Reorder blocks by a list of "units" (ADR-0028 group drag). While a group is
 * dragged the Builder collapses EVERY group to a single header row, so the drag
 * list is a sequence of unit ids: a group-header id (`${headerPrefix}<gid>`) or
 * a lone block's instanceId. Expand that unit order back into a flat block order
 * — a header emits its members in their existing relative order; a lone id emits
 * that block. Group membership is untouched; only whole groups + lone blocks
 * move. A grouped member id that leaks into `unitIds` is ignored in place (its
 * header emits it); any block not covered by a unit is appended in original
 * order, so a reorder can NEVER drop or duplicate a block. Pure + deterministic.
 */
export function reorderByUnits<T extends { instanceId: string; groupId: string | null }>(
  blocks: T[],
  unitIds: string[],
  headerPrefix: string,
): T[] {
  const byId = new Map(blocks.map((b) => [b.instanceId, b]));
  const out: T[] = [];
  const emitted = new Set<string>();
  const emit = (b: T) => {
    if (emitted.has(b.instanceId)) return;
    out.push(b);
    emitted.add(b.instanceId);
  };
  for (const uid of unitIds) {
    if (uid.startsWith(headerPrefix)) {
      const gid = uid.slice(headerPrefix.length);
      for (const b of blocks) if (b.groupId === gid) emit(b);
    } else {
      const b = byId.get(uid);
      if (b && !b.groupId) emit(b); // grouped members ride their header, not their own id
    }
  }
  for (const b of blocks) emit(b); // safety net: never drop a block
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
      screens.push({
        id: gid,
        kind: "group",
        title: g.title ?? null,
        showIf: g.showIf,
        maxTimeSec: g.maxTimeSec,
        interactionRequirements: g.interactionRequirements,
        showRequirementSummary: g.showRequirementSummary,
        blocks: members,
      });
    } else {
      screens.push({ id: b.instanceId, kind: "single", title: null, showIf: b.showIf, blocks: [b] });
      i += 1;
    }
  }
  return foldNotifications(screens);
}

/**
 * A notification is CHROME, not a screen (owner 2026-07-07): an ungrouped
 * notification block is folded onto the NEXT content screen (it banners over that
 * block), rather than getting a standalone screen with an empty study card. A
 * GROUPED notification already lives in its group screen, so it's untouched. This
 * runs inside deriveScreens so the runtime, preview, whiteboard, and the CTA
 * screen-picker all agree — 1-based screen numbering stays consistent everywhere.
 *
 * Edge handling: consecutive notifications fold onto the same next content screen;
 * a notification whose next screen is an OVERLAY (login/modal — which must own
 * their screen) is NOT merged into it (that would break the full-screen login /
 * the modal overlay), so it keeps its own screen; trailing notifications with no
 * content after fold onto the last content screen; a study of only notifications
 * keeps them as their own screens.
 */
function foldNotifications(screens: Screen[]): Screen[] {
  const isLoneNotif = (s: Screen) => s.kind === "single" && s.blocks.length === 1 && s.blocks[0].key === "notification";
  const isOverlay = (s: Screen) => s.blocks.length > 0 && s.blocks.every((b) => b.key === "modal" || b.key === "login" || b.key === "notification");

  const out: Screen[] = [];
  let buffer: BlockInstance[] = []; // notifications waiting for the next content screen
  const flushOwn = () => {
    for (const n of buffer) out.push({ id: n.instanceId, kind: "single", title: null, showIf: n.showIf, blocks: [n] });
    buffer = [];
  };
  for (const s of screens) {
    if (isLoneNotif(s)) {
      buffer.push(s.blocks[0]);
    } else if (isOverlay(s)) {
      // Login / modal must own their screen — don't absorb a notification into it.
      flushOwn();
      out.push(s);
    } else if (buffer.length) {
      out.push({ ...s, blocks: [...buffer, ...s.blocks] }); // banner(s) over this screen's content
      buffer = [];
    } else {
      out.push(s);
    }
  }
  if (buffer.length) {
    // Trailing notifications: attach to the last CONTENT screen if there is one.
    const lastContent = [...out.keys()].reverse().find((k) => !isOverlay(out[k]));
    if (lastContent !== undefined) out[lastContent] = { ...out[lastContent], blocks: [...out[lastContent].blocks, ...buffer] };
    else flushOwn();
  }
  return out;
}
