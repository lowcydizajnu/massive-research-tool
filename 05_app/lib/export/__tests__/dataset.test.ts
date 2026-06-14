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

import { spatialLinks } from "@/lib/export/dataset";

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
      spatial: { kind: "heat-map", imageUrl: "/api/media/ws/x/a.png", points: [{ x: 0.5, y: 0.5 }], responses: [] },
    },
  ],
};

describe("spatial viz links (ADR-0041 amendment)", () => {
  it("one absolute Explore URL per spatial block; none for non-spatial datasets", () => {
    expect(spatialLinks(results, "study-1", "https://app.example")).toEqual([]);
    expect(spatialLinks(withSpatial, "study-1", "https://app.example")).toEqual([
      { prompt: "Where did your eye go?", url: "https://app.example/studies/study-1/results/explore/hm1" },
    ]);
  });

  it("toDelimited appends the link section only when opts + spatial blocks are present", () => {
    const cols = baseColumns(withSpatial);
    expect(toDelimited(withSpatial, cols, ",")).not.toContain("Spatial visualizations"); // no opts
    expect(toDelimited(results, cols, ",", { studyId: "s", origin: "https://app.example" })).not.toContain(
      "Spatial visualizations",
    ); // opts but no spatial blocks
    const csv = toDelimited(withSpatial, cols, ",", { studyId: "study-1", origin: "https://app.example" });
    expect(csv).toContain("# Spatial visualizations (open in browser, signed in)");
    expect(csv).toContain("https://app.example/studies/study-1/results/explore/hm1");
    expect(csv).toContain("\r\nblock,url\r\n"); // labeled mini-table header, instance_id dropped
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
