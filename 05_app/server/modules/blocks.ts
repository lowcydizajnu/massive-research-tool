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
