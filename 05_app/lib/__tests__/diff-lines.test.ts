import { describe, expect, it } from "vitest";

import { diffLines } from "@/lib/diff-lines";

describe("diffLines (ADR-0031)", () => {
  it("marks unchanged, added, and removed lines", () => {
    const out = diffLines(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(out).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "x" },
      { type: "same", text: "c" },
      { type: "added", text: "d" },
    ]);
  });
  it("handles empty sides", () => {
    expect(diffLines([], ["a"])).toEqual([{ type: "added", text: "a" }]);
    expect(diffLines(["a"], [])).toEqual([{ type: "removed", text: "a" }]);
    expect(diffLines([], [])).toEqual([]);
  });
  it("identical inputs → all same", () => {
    expect(diffLines(["a", "b"], ["a", "b"]).every((l) => l.type === "same")).toBe(true);
  });
});
