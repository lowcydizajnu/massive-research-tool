import { describe, expect, it } from "vitest";

import { move } from "../reorder";

describe("move", () => {
  it("moves an item down", () => {
    expect(move(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
  it("moves an item up", () => {
    expect(move(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("no-ops on same index or out of range", () => {
    expect(move(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(move(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});
