import { describe, expect, it } from "vitest";

import { readOverview } from "@/server/modules/blocks";

describe("readOverview (V1.12 B1)", () => {
  it("returns an empty default for missing/blank snapshots", () => {
    expect(readOverview(null)).toEqual({ abstract: "", hypotheses: [], sections: [] });
    expect(readOverview({})).toEqual({ abstract: "", hypotheses: [], sections: [] });
    expect(readOverview({ blocks: [] })).toEqual({ abstract: "", hypotheses: [], sections: [] });
  });
  it("reads a stored overview incl. multiple hypotheses; coerces malformed fields", () => {
    const ov = {
      abstract: "A study about headlines.",
      hypotheses: ["H1: warnings reduce credibility.", "H2: effect is larger for older adults."],
      sections: [{ id: "s1", heading: "Background", contentMd: "…" }],
    };
    expect(readOverview({ blocks: [], overview: ov })).toEqual(ov);
    // malformed: non-string abstract, non-array hypotheses/sections → safe defaults
    expect(readOverview({ overview: { abstract: 5, hypotheses: "no", sections: "nope" } })).toEqual({
      abstract: "",
      hypotheses: [],
      sections: [],
    });
    // hypotheses array with non-strings → filtered
    expect(readOverview({ overview: { hypotheses: ["H1", 2, null, "H2"] } }).hypotheses).toEqual(["H1", "H2"]);
  });
});
