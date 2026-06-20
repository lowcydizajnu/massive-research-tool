/**
 * Factorial variants (ADR-0058) — pure, client-safe model + resolution.
 *
 * A study can declare **factors** (each with ≥2 **levels**), e.g. "Social
 * influence: low/high". Specific block-config fields are **bound** to a factor
 * (`variantBindings`), taking a different value per level. A **cell** is one
 * chosen level per factor; the set of cells is the cross-product. Shared content
 * is the single source of truth — a cell only overrides its bound fields. At run
 * time each participant is assigned one cell (between-subjects) and a block's
 * config is resolved by applying that cell's overrides.
 *
 * Everything here is pure (no imports beyond types) so the Builder, the runtime,
 * and the flow diagram all agree.
 */

export type VariantLevel = { id: string; name: string };
export type VariantFactor = { id: string; name: string; levels: VariantLevel[] };

/** A bound field: `path` is a dot-path into a block's `config` (e.g. "likes"). */
export type VariantBinding = {
  instanceId: string;
  path: string;
  factorId: string;
  /** levelId → the value that field takes for that level. */
  valuesByLevel: Record<string, unknown>;
};

/** A cell = chosen level per factor (factorId → levelId). `{}` = the lone cell of a no-factor study. */
export type VariantCell = Record<string, string>;

/** Number of cells = product of each factor's level count (1 when there are no factors). */
export function cellCount(factors: VariantFactor[]): number {
  return factors.reduce((n, f) => n * Math.max(1, f.levels.length), 1);
}

/** All cells, in a stable order (cross-product of factor levels). Always ≥1 (the empty cell). */
export function enumerateCells(factors: VariantFactor[]): VariantCell[] {
  let cells: VariantCell[] = [{}];
  for (const f of factors) {
    if (f.levels.length === 0) continue;
    const next: VariantCell[] = [];
    for (const c of cells) for (const lvl of f.levels) next.push({ ...c, [f.id]: lvl.id });
    cells = next;
  }
  return cells;
}

/** A stable key for a cell (order-independent). */
export function cellKey(cell: VariantCell): string {
  return Object.keys(cell)
    .sort()
    .map((k) => `${k}:${cell[k]}`)
    .join("|");
}

/** Human label for a cell, e.g. "low · gain" (skips factors not in the cell). */
export function cellLabel(cell: VariantCell, factors: VariantFactor[]): string {
  const parts: string[] = [];
  for (const f of factors) {
    const levelId = cell[f.id];
    if (!levelId) continue;
    parts.push(f.levels.find((l) => l.id === levelId)?.name ?? levelId);
  }
  return parts.join(" · ") || "All participants";
}

/** Uniform-random cell assignment (between-subjects). */
export function pickCell(factors: VariantFactor[], rng: () => number = Math.random): VariantCell {
  const cells = enumerateCells(factors);
  return cells[Math.floor(rng() * cells.length)] ?? {};
}

/* ---------- config resolution ---------- */

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split(".").filter(Boolean);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const k = segs[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

/**
 * The block's config with this cell's overrides applied. Bindings for other
 * blocks are ignored; a binding whose factor isn't in the cell, or whose level
 * has no value, is skipped (the shared value stands). Returns a NEW object;
 * never mutates the input.
 */
export function resolveConfigForCell(
  instanceId: string,
  config: Record<string, unknown>,
  cell: VariantCell,
  bindings: VariantBinding[],
): Record<string, unknown> {
  const mine = bindings.filter((b) => b.instanceId === instanceId);
  if (mine.length === 0) return config;
  const out = structuredClone(config);
  for (const b of mine) {
    const levelId = cell[b.factorId];
    if (!levelId) continue;
    if (!(levelId in b.valuesByLevel)) continue;
    setAtPath(out, b.path, b.valuesByLevel[levelId]);
  }
  return out;
}

/** Bound (field × level) pairs that have no value set — drives the preregister readiness check. */
export function missingBindingValues(
  factors: VariantFactor[],
  bindings: VariantBinding[],
): { binding: VariantBinding; levelId: string }[] {
  const byId = new Map(factors.map((f) => [f.id, f]));
  const out: { binding: VariantBinding; levelId: string }[] = [];
  for (const b of bindings) {
    const f = byId.get(b.factorId);
    if (!f) continue; // dangling binding (factor removed) — handled separately
    for (const lvl of f.levels) {
      const v = b.valuesByLevel[lvl.id];
      if (v === undefined || v === null || v === "") out.push({ binding: b, levelId: lvl.id });
    }
  }
  return out;
}

/** Drop bindings whose factor no longer exists (cleanup, mirrors forward-condition pruning). */
export function pruneBindings(factors: VariantFactor[], bindings: VariantBinding[]): VariantBinding[] {
  const ids = new Set(factors.map((f) => f.id));
  return bindings.filter((b) => ids.has(b.factorId));
}
