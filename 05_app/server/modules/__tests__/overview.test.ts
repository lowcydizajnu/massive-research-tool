import { describe, expect, it } from "vitest";

import { readOverview } from "@/server/modules/blocks";

describe("readOverview (V1.12 B1)", () => {
  it("returns an empty default for missing/blank snapshots", () => {
    expect(readOverview(null)).toEqual({ abstract: "", sections: [] });
    expect(readOverview({})).toEqual({ abstract: "", sections: [] });
    expect(readOverview({ blocks: [] })).toEqual({ abstract: "", sections: [] });
  });
  it("reads a stored overview and coerces malformed fields", () => {
    const ov = {
      abstract: "A study about headlines.",
      sections: [{ id: "s1", heading: "Hypotheses", contentMd: "H1: …" }],
    };
    expect(readOverview({ blocks: [], overview: ov })).toEqual(ov);
    // malformed: non-string abstract, non-array sections → safe defaults
    expect(readOverview({ overview: { abstract: 5, sections: "nope" } })).toEqual({
      abstract: "",
      sections: [],
    });
  });
});
