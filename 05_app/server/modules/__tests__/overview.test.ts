import { describe, expect, it } from "vitest";

import { readOverview } from "@/server/modules/blocks";

const EMPTY = { abstract: "", hypotheses: [], sections: [], replicationNotes: "" };

describe("readOverview (V1.12 B1)", () => {
  it("returns an empty default for missing/blank snapshots", () => {
    expect(readOverview(null)).toEqual(EMPTY);
    expect(readOverview({})).toEqual(EMPTY);
    expect(readOverview({ blocks: [] })).toEqual(EMPTY);
  });
  it("reads a stored overview incl. hypotheses + replication notes; coerces malformed fields", () => {
    const ov = {
      abstract: "A study about headlines.",
      hypotheses: ["H1: warnings reduce credibility.", "H2: effect is larger for older adults."],
      sections: [{ id: "s1", heading: "Background", contentMd: "…" }],
      replicationNotes: "Swapped the stimulus set; added an attention check.",
    };
    expect(readOverview({ blocks: [], overview: ov })).toEqual(ov);
    // malformed: non-string fields → safe defaults
    expect(
      readOverview({ overview: { abstract: 5, hypotheses: "no", sections: "nope", replicationNotes: 9 } }),
    ).toEqual(EMPTY);
    // hypotheses array with non-strings → filtered
    expect(readOverview({ overview: { hypotheses: ["H1", 2, null, "H2"] } }).hypotheses).toEqual(["H1", "H2"]);
  });
});
