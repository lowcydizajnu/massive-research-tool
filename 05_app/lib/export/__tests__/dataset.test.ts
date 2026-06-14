import { describe, expect, it } from "vitest";

import { baseColumns, buildMatrix, dataDictionary, slugifyLabel, toDelimited, toJSON } from "@/lib/export/dataset";
import type { ResultsSummary } from "@/server/trpc/routers/studies";

const results: ResultsSummary = {
  versionNumber: 1,
  totalCompleted: 2,
  includesPreview: false,
  conditions: [{ slug: "control", name: "Control", completed: 2 }],
  questions: [
    { instanceId: "q1", prompt: "How credible?", moduleKey: "likert-7", n: 2, kind: "numeric", mean: 4, optionCounts: [] },
    { instanceId: "q2", prompt: "Why, in your words?", moduleKey: "free-text", n: 2, kind: "text", mean: null, optionCounts: [] },
  ],
  rows: [
    { responseId: "r1", conditionSlug: "control", externalPid: null, startedAt: "2026-06-08T10:00:00Z", completedAt: "2026-06-08T10:05:00Z", answers: { q1: "5", q2: "Looks legit, has a source" } },
    { responseId: "r2", conditionSlug: "control", externalPid: "PID9", startedAt: "2026-06-08T11:00:00Z", completedAt: "2026-06-08T11:04:00Z", answers: { q1: "3", q2: 'She said "maybe", unsure' } },
  ],
};

describe("export dataset (V1.12 D)", () => {
  it("slugifies labels", () => {
    expect(slugifyLabel("How credible?")).toBe("how_credible");
    expect(slugifyLabel("  ")).toBe("var");
  });

  it("baseColumns = 5 meta + one per question, with de-duped labels", () => {
    const cols = baseColumns(results);
    expect(cols.map((c) => c.key)).toEqual(["responseId", "conditionSlug", "externalPid", "startedAt", "completedAt", "q1", "q2"]);
    expect(cols.find((c) => c.key === "q1")?.label).toBe("how_credible");
  });

  it("buildMatrix respects visibility + order", () => {
    const cols = baseColumns(results).filter((c) => c.key === "responseId" || c.key === "q1");
    const m = buildMatrix(results, cols);
    expect(m.headers).toEqual(["response_id", "how_credible"]);
    expect(m.rows).toEqual([["r1", "5"], ["r2", "3"]]);
  });

  it("CSV quotes commas + quotes; TSV uses tabs", () => {
    const cols = baseColumns(results).filter((c) => c.key === "q2");
    const csv = toDelimited(results, cols, ",");
    expect(csv).toContain('"She said ""maybe"", unsure"'); // doubled quotes + wrapped
    const tsv = toDelimited(results, baseColumns(results), "\t");
    expect(tsv.split("\r\n")[0]).toContain("\t");
  });

  it("JSON keyed by export label; dictionary lists visible vars", () => {
    const cols = baseColumns(results);
    const json = JSON.parse(toJSON(results, cols));
    expect(json[0].how_credible).toBe("5");
    const dict = dataDictionary(cols.map((c) => (c.key === "q2" ? { ...c, hidden: true } : c)));
    expect(dict.variables.find((v) => v.name === "why_in_your_words")).toBeUndefined(); // hidden excluded
    expect(dict.variables.find((v) => v.name === "how_credible")?.type).toBe("numeric");
  });
});

// A spatial block where r1 answered but r2 did NOT (rows ⊋ spatial.responses) —
// exercises the per-respondent deep-link column + the membership guard.
const withSpatial: ResultsSummary = {
  ...results,
  questions: [
    ...results.questions,
    {
      instanceId: "hm1",
      prompt: "Where did your eye go?",
      moduleKey: "heat-map",
      n: 1,
      kind: "text",
      mean: null,
      optionCounts: [],
      spatial: {
        kind: "heat-map",
        imageUrl: "/api/media/ws/x/a.png",
        points: [{ x: 0.5, y: 0.5 }],
        responses: [{ responseId: "r1", conditionSlug: "control", externalPid: null, points: [{ x: 0.5, y: 0.5 }] }],
      },
    },
  ],
};

describe("per-respondent spatial deep-link column (ADR-0041 amendment 2026-06-14b)", () => {
  it("baseColumns appends one viz column per spatial block, after questions; none when no spatial", () => {
    expect(baseColumns(results).some((c) => c.key.startsWith("viz:"))).toBe(false);
    const cols = baseColumns(withSpatial);
    const viz = cols.filter((c) => c.key.startsWith("viz:"));
    expect(viz.map((c) => c.key)).toEqual(["viz:hm1"]);
    expect(viz[0].label).toBe("where_did_your_eye_go_explore_url"); // researcher-native, no "instanceId"
    expect(cols[cols.length - 1].key).toBe("viz:hm1"); // appended last
  });

  it("buildMatrix with ctx → per-respondent deep link, empty for respondents not in the block", () => {
    const cols = baseColumns(withSpatial).filter((c) => c.key === "responseId" || c.key === "viz:hm1");
    const ctx = { studyId: "study-1", origin: "https://app.example" };
    const m = buildMatrix(withSpatial, cols, ctx);
    expect(m.rows[0]).toEqual(["r1", "https://app.example/studies/study-1/results/explore/hm1?r=r1"]);
    expect(m.rows[1]).toEqual(["r2", ""]); // r2 has no response for this block → blank, not a wrong link
  });

  it("buildMatrix without ctx → viz cells blank (never a relative URL)", () => {
    const cols = baseColumns(withSpatial).filter((c) => c.key === "viz:hm1");
    expect(buildMatrix(withSpatial, cols).rows).toEqual([[""], [""]]);
  });

  it("toDelimited emits the URL inline (no trailing section), unquoted + injection-safe", () => {
    const cols = baseColumns(withSpatial);
    const csv = toDelimited(withSpatial, cols, ",", { studyId: "study-1", origin: "https://app.example" });
    expect(csv).not.toContain("# Spatial visualizations"); // the old collective section is gone
    expect(csv).toContain("https://app.example/studies/study-1/results/explore/hm1?r=r1");
    // raw https URL has no comma/quote → emitted unquoted, no leading = + - @ (CSV-injection-safe)
    expect(csv).toContain(",https://app.example/studies/study-1/results/explore/hm1?r=r1");
  });
});

import { toExcelCsv, toSpssSyntax, toStataDo } from "@/lib/export/dataset";

describe("export companions (V1.12 D — formats)", () => {
  it("Excel CSV is BOM-prefixed", () => {
    const csv = toExcelCsv(results, baseColumns(results));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
  it("SPSS syntax references the CSV + labels visible vars", () => {
    const sps = toSpssSyntax(baseColumns(results), "study.csv");
    expect(sps).toContain('GET DATA /TYPE=TXT /FILE="study.csv"');
    expect(sps).toContain("VARIABLE LABELS");
    expect(sps).toContain('how_credible "How credible?"');
  });
  it("Stata do-file imports + labels", () => {
    const doFile = toStataDo(baseColumns(results), "study.csv");
    expect(doFile).toContain('import delimited "study.csv", varnames(1) clear');
    expect(doFile).toContain('label variable how_credible "How credible?"');
  });
});
