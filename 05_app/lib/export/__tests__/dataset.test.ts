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
