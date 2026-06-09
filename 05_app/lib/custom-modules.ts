import type { BlockInstance } from "@/server/modules/blocks";

/**
 * Custom composite modules (ADR-0029) — a saved group template. A SavedBlock is
 * a member stripped of study-specific fields (instance id, branch rules, arm
 * gates); inserting a module copies its blocks with fresh ids into a new group.
 */
export type SavedBlock = {
  source: string;
  key: string;
  version: string;
  config: Record<string, unknown>;
  title?: string;
};

export type CustomModuleDefinition = {
  title?: string;
  blocks: SavedBlock[];
};

/** Project a group's member blocks to a portable template (drops instance ids,
 *  branch rules, arm gates, showIf — those don't travel with a template). */
export function groupToDefinition(members: BlockInstance[], title?: string): CustomModuleDefinition {
  return {
    ...(title && title.trim() ? { title: title.trim() } : {}),
    blocks: members.map((m) => ({
      source: m.source,
      key: m.key,
      version: m.version,
      config: m.config ?? {},
      ...(m.title ? { title: m.title } : {}),
    })),
  };
}

/** Materialise a template into live blocks: fresh instance ids, all assigned to
 *  one fresh group. `makeId` supplies unique instance ids (ulid in prod). */
export function definitionToBlocks(
  def: CustomModuleDefinition,
  groupId: string,
  makeId: () => string,
): BlockInstance[] {
  return def.blocks.map((sb) => ({
    instanceId: makeId(),
    source: sb.source,
    key: sb.key,
    version: sb.version,
    config: sb.config ?? {},
    ...(sb.title ? { title: sb.title } : {}),
    groupId,
  }));
}
