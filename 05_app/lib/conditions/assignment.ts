/**
 * Condition-assignment maths (ADR-0109). Pure + client-safe: the runtime uses
 * `permutedBlockIndex` to assign, and the Builder UI reuses `blockSizeFor` to
 * explain the block to a researcher. No DB, no `Math.random` — the balanced
 * method must be reproducible, so all randomness comes from a seeded PRNG.
 */

/** mulberry32 — a tiny, fast, seedable PRNG. Deterministic given the seed, which
 *  is exactly why we use it instead of `Math.random` for balanced assignment. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string → uint32 seed. Stable across runs and machines. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Reduce non-negative integer weights to their smallest whole-number ratio. */
export function reduceWeights(weights: number[]): number[] {
  const ints = weights.map((w) => Math.max(0, Math.round(w)));
  const g = ints.reduce((acc, w) => (w > 0 ? gcd(acc, w) : acc), 0);
  return g > 0 ? ints.map((w) => w / g) : ints;
}

/**
 * The permuted-block for these weights: an array of condition INDICES, each index
 * repeated by its reduced weight (e.g. weights [1,2] → block `[0,1,1]`). Its
 * length is the block size — balance is exact at every multiple of it.
 */
export function buildBlock(weights: number[]): number[] {
  const reduced = reduceWeights(weights);
  const block: number[] = [];
  reduced.forEach((w, i) => {
    for (let j = 0; j < w; j++) block.push(i);
  });
  return block;
}

/** Block size for a weight set — how many participants complete one balanced set.
 *  0 when every weight is 0 (a degenerate design). Used by the Builder helper. */
export function blockSizeFor(weights: number[]): number {
  return buildBlock(weights).length;
}

/** Seeded Fisher–Yates — pure, deterministic given `rng`. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Permuted-block condition assignment (ADR-0109 D3). Returns the condition INDEX
 * for the participant at 0-based `ordinal` (the count of prior real assignments
 * in this recruitment session), given the per-condition `weights`.
 *
 * Balanced at every block boundary; the order WITHIN a block is a deterministic
 * shuffle seeded on `(sessionId, blockIndex)`, so it is reproducible and
 * race-free given the ordinal — never `Math.random`. All-zero weights fall back
 * to the first condition (matching the simple path's fallback).
 */
export function permutedBlockIndex(weights: number[], sessionId: string, ordinal: number): number {
  const block = buildBlock(weights);
  if (block.length === 0) return 0;
  const blockIndex = Math.floor(ordinal / block.length);
  const slot = ((ordinal % block.length) + block.length) % block.length; // guard negatives
  const rng = mulberry32(hashSeed(`${sessionId}:${blockIndex}`));
  return shuffle(block, rng)[slot];
}
