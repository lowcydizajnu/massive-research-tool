import { describe, expect, it } from "vitest";

import { blockSizeFor, permutedBlockIndex, reduceWeights } from "@/lib/conditions/assignment";

describe("reduceWeights (ADR-0109)", () => {
  it("reduces to the smallest whole-number ratio", () => {
    expect(reduceWeights([30, 70])).toEqual([3, 7]);
    expect(reduceWeights([2, 4])).toEqual([1, 2]);
    expect(reduceWeights([50, 50])).toEqual([1, 1]);
    expect(reduceWeights([1, 1, 1])).toEqual([1, 1, 1]);
  });
  it("rounds fractional weights and tolerates zeros", () => {
    expect(reduceWeights([1.5, 1.5])).toEqual([1, 1]); // round → [2,2] → /2
    expect(reduceWeights([0, 0])).toEqual([0, 0]);
    expect(reduceWeights([0, 2])).toEqual([0, 1]);
  });
});

describe("blockSizeFor (ADR-0109)", () => {
  it("is the sum of the reduced ratio", () => {
    expect(blockSizeFor([1, 1])).toBe(2);
    expect(blockSizeFor([1, 2])).toBe(3);
    expect(blockSizeFor([30, 70])).toBe(10);
    expect(blockSizeFor([0, 0])).toBe(0);
  });
});

/** Tally the arm each of the first `n` participants gets, for a session. */
function tally(weights: number[], sessionId: string, n: number): number[] {
  const counts = new Array(weights.length).fill(0);
  for (let k = 0; k < n; k++) counts[permutedBlockIndex(weights, sessionId, k)] += 1;
  return counts;
}

describe("permutedBlockIndex — balance + reproducibility (ADR-0109)", () => {
  it("is EXACTLY balanced at every block boundary (equal split)", () => {
    // Block size 2. After each pair, both arms are used exactly once more.
    expect(tally([1, 1], "sess-1", 2)).toEqual([1, 1]);
    expect(tally([1, 1], "sess-1", 4)).toEqual([2, 2]);
    expect(tally([1, 1], "sess-1", 20)).toEqual([10, 10]);
  });

  it("honours the ratio at block boundaries (2:1 split)", () => {
    // Block [0,1,1] size 3 → after 3, arm0 once + arm1 twice; after 30, 10/20.
    expect(tally([1, 2], "sess-x", 3)).toEqual([1, 2]);
    expect(tally([1, 2], "sess-x", 30)).toEqual([10, 20]);
  });

  it("never drifts more than one block from perfect balance mid-block", () => {
    // At any point, the max deviation from the target is bounded by one block —
    // the whole point of permuted-block. Equal 3-arm, block 3.
    const c = tally([1, 1, 1], "s", 3 * 7 + 1); // 22 participants
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });

  it("is reproducible — same (weights, session, ordinal) → same arm", () => {
    for (let k = 0; k < 12; k++) {
      expect(permutedBlockIndex([1, 2], "sess-r", k)).toBe(permutedBlockIndex([1, 2], "sess-r", k));
    }
  });

  it("shuffles WITHIN a block — order is not fixed across blocks", () => {
    // Across many blocks the first slot varies (a fixed order would fail this).
    const firstSlots = new Set<number>();
    for (let b = 0; b < 20; b++) firstSlots.add(permutedBlockIndex([1, 1], "sess-s", b * 2));
    expect(firstSlots.size).toBe(2); // both arms appear as the block's first slot
  });

  it("different sessions get independent shuffles (not identical sequences)", () => {
    const a = Array.from({ length: 12 }, (_, k) => permutedBlockIndex([1, 1], "sess-A", k));
    const b = Array.from({ length: 12 }, (_, k) => permutedBlockIndex([1, 1], "sess-B", k));
    expect(a).not.toEqual(b);
  });

  it("all-zero weights fall back to the first condition", () => {
    expect(permutedBlockIndex([0, 0], "s", 0)).toBe(0);
    expect(permutedBlockIndex([0, 0], "s", 5)).toBe(0);
  });
});
