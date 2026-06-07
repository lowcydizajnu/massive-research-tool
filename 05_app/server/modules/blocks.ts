import { getModuleDef } from "./registry";

/**
 * A block instance inside ExperimentVersion.definition_snapshot (ADR-0012).
 * `config` is validated against the module's Zod schema at the write boundary.
 */
export type BlockInstance = {
  instanceId: string; // ULID
  source: string;
  key: string;
  version: string;
  config: Record<string, unknown>;
  /**
   * Optional researcher-set label for this block instance (distinct from the
   * module type). Absent = fall back to the module's display name. Stored in the
   * blocks JSON (no migration); never shown to participants.
   */
  title?: string;
  /**
   * Optional condition-visibility rule (ADR-0014). Absent / empty = shown to
   * every condition. Values are condition *slugs* (stable across the preregister
   * snapshot copy). The participant runtime enforces this server-side.
   */
  visibility?: { showIfCondition?: string[] };
};

export type ModuleLock = { source: string; key: string; version: string };

/** Read the block array out of a (possibly empty/unknown) definition_snapshot. */
export function readBlocks(snapshot: unknown): BlockInstance[] {
  if (snapshot && typeof snapshot === "object" && "blocks" in snapshot) {
    const b = (snapshot as { blocks?: unknown }).blocks;
    if (Array.isArray(b)) return b as BlockInstance[];
  }
  return [];
}

/** Derive module_version_locks (distinct triples) from the block set. */
export function locksFromBlocks(blocks: BlockInstance[]): ModuleLock[] {
  const seen = new Set<string>();
  const locks: ModuleLock[] = [];
  for (const b of blocks) {
    const ref = `${b.source}/${b.key}@${b.version}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      locks.push({ source: b.source, key: b.key, version: b.version });
    }
  }
  return locks;
}

/**
 * Validate (and normalize) a config against the referenced module's Zod schema.
 * Throws if the module is unknown or the config is structurally invalid.
 */
export function validateConfig(
  source: string,
  key: string,
  version: string,
  config: unknown,
): Record<string, unknown> {
  const def = getModuleDef(source, key, version);
  if (!def) throw new Error(`Unknown module ${source}/${key}@${version}`);
  return def.configSchema.parse(config);
}

/** Display name + completeness for a block (for cards + validation badges). */
export function blockDisplay(b: BlockInstance): {
  name: string;
  ref: string;
  complete: boolean;
} {
  const def = getModuleDef(b.source, b.key, b.version);
  return {
    name: def?.name ?? `${b.source}/${b.key}`,
    ref: `${b.source}/${b.key}@${b.version}`,
    complete: def ? def.isComplete(b.config) : false,
  };
}

export type BlockRef = { instanceId: string; name: string; ref: string };
export type BlockDiff = {
  added: BlockRef[];
  removed: BlockRef[];
  changed: BlockRef[];
  unchangedCount: number;
};

/** Stable JSON for config comparison (key order shouldn't count as a change). */
function stableConfig(c: Record<string, unknown>): string {
  return JSON.stringify(c, Object.keys(c).sort());
}
function refOf(b: BlockInstance): BlockRef {
  const d = blockDisplay(b);
  return { instanceId: b.instanceId, name: d.name, ref: d.ref };
}

/**
 * Divergence of a forked study's blocks from its source (ADR-0018), aligned by
 * `instanceId` — forks preserve instanceIds, so a matching id means "same
 * block, possibly edited". A block is `changed` when its module ref
 * (source/key@version) or its config differs. Pure + deterministic.
 */
export function diffBlocks(parent: BlockInstance[], child: BlockInstance[]): BlockDiff {
  const byParent = new Map(parent.map((b) => [b.instanceId, b]));
  const byChild = new Map(child.map((b) => [b.instanceId, b]));

  const added = child.filter((b) => !byParent.has(b.instanceId)).map(refOf);
  const removed = parent.filter((b) => !byChild.has(b.instanceId)).map(refOf);

  const changed: BlockRef[] = [];
  let unchangedCount = 0;
  for (const c of child) {
    const p = byParent.get(c.instanceId);
    if (!p) continue; // counted in `added`
    const refChanged = `${p.source}/${p.key}@${p.version}` !== `${c.source}/${c.key}@${c.version}`;
    const configChanged = stableConfig(p.config) !== stableConfig(c.config);
    if (refChanged || configChanged) changed.push(refOf(c));
    else unchangedCount += 1;
  }
  return { added, removed, changed, unchangedCount };
}
