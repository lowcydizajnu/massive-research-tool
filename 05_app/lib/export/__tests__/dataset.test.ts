import { describe, expect, it } from "vitest";

import { baseColumns, buildMatrix, dataDictionary, slugifyLabel, toDelimited, toJSON } from "@/lib/export/dataset";
import type { ResultsSummary } from "@/server/trpc/routers/studies";

const results: ResultsSummary = {
  versionNumber: 1,
  selectedVersion: null,
  availableVersions: [1],
  totalCompleted: 2,
  includesPreview: false,
  conditions: [{ slug: "control", name: "Control", completed: 2 }],
  combinations: [],
  questions: [
    { instanceId: "q1", prompt: "How credible?", moduleKey: "likert-7", n: 2, kind: "numeric", mean: 4, optionCounts: [] },
    { instanceId: "q2", prompt: "Why, in your words?", moduleKey: "free-text", n: 2, kind: "text", mean: null, optionCounts: [] },
  ],
  rows: [
    { responseId: "r1", conditionSlug: "control", cell: null, externalPid: null, versionNumber: 1, startedAt: "2026-06-08T10:00:00Z", completedAt: "2026-06-08T10:05:00Z", answers: { q1: "5", q2: "Looks legit, has a source" } },
    { responseId: "r2", conditionSlug: "control", cell: null, externalPid: "PID9", versionNumber: 1, startedAt: "2026-06-08T11:00:00Z", completedAt: "2026-06-08T11:04:00Z", answers: { q1: "3", q2: 'She said "maybe", unsure' } },
  ],
};

describe("export dataset (V1.12 D)", () => {
  it("slugifies labels", () => {
    expect(slugifyLabel("How credible?")).toBe("how_credible");
    expect(slugifyLabel("  ")).toBe("var");
  });

  it("baseColumns = 6 meta + one per question, with de-duped labels", () => {
    const cols = baseColumns(results);
    expect(cols.map((c) => c.key)).toEqual(["responseId", "conditionSlug", "versionNumber", "externalPid", "startedAt", "completedAt", "q1", "q2"]);
    expect(cols.find((c) => c.key === "q1")?.label).toBe("how_credible");
    expect(cols.find((c) => c.key === "versionNumber")?.label).toBe("version");
  });

  it("adds a variant_combination column only when rows carry a combination (ADR-0058)", () => {
    expect(baseColumns(results).some((c) => c.key === "cell")).toBe(false);
    const withCells = {
      ...results,
      rows: results.rows.map((r, i) => ({ ...r, cell: i === 0 ? "low · gain" : "high · loss" })),
    };
    const cols = baseColumns(withCells);
    const cell = cols.find((c) => c.key === "cell");
    expect(cell?.label).toBe("variant_combination");
    // Sits right after the condition column.
    expect(cols.map((c) => c.key).indexOf("cell")).toBe(cols.map((c) => c.key).indexOf("conditionSlug") + 1);
    const m = buildMatrix(withCells, cols.filter((c) => c.key === "cell"));
    expect(m.rows).toEqual([["low · gain"], ["high · loss"]]);
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

// An emotion-enabled free-text block (ADR-0066 H3a): r1 analyzed (ok), r2 still
// pending. Names come pre-unioned + sorted from getResults; per-respondent scores
// + status ride in row.answers under `emo:`/`emostatus:` keys.
const withEmotion: ResultsSummary = {
  ...results,
  questions: [
    results.questions[0],
    {
      ...results.questions[1],
      emotion: {
        n: 1,
        failed: 0,
        pending: 1,
        names: ["Anger", "Joy"],
        top: [
          { name: "Joy", score: 0.7 },
          { name: "Anger", score: 0.1 },
        ],
      },
    },
  ],
  rows: [
    { ...results.rows[0], answers: { ...results.rows[0].answers, "emostatus:q2": "ok", "emo:q2:Anger": "0.1000", "emo:q2:Joy": "0.7000" } },
    { ...results.rows[1], answers: { ...results.rows[1].answers, "emostatus:q2": "pending" } },
  ],
};

describe("emotion export columns (ADR-0066 H3a)", () => {
  it("appends a status column + one numeric column per emotion, only for emotion blocks", () => {
    expect(baseColumns(results).some((c) => c.key.startsWith("emo"))).toBe(false);
    const cols = baseColumns(withEmotion);
    const emo = cols.filter((c) => c.key.startsWith("emostatus:") || c.key.startsWith("emo:"));
    expect(emo.map((c) => c.key)).toEqual(["emostatus:q2", "emo:q2:Anger", "emo:q2:Joy"]);
    expect(emo.map((c) => c.label)).toEqual(["why_in_your_words_emotion_status", "why_in_your_words_emo_anger", "why_in_your_words_emo_joy"]);
    expect(cols.find((c) => c.key === "emostatus:q2")?.type).toBe("categorical");
    expect(cols.find((c) => c.key === "emo:q2:Joy")?.type).toBe("numeric");
  });

  it("buildMatrix fills scores for analyzed rows, blanks for pending; status always present", () => {
    const cols = baseColumns(withEmotion).filter((c) => c.key.startsWith("emo"));
    const m = buildMatrix(withEmotion, cols);
    expect(m.headers).toEqual(["why_in_your_words_emotion_status", "why_in_your_words_emo_anger", "why_in_your_words_emo_joy"]);
    expect(m.rows[0]).toEqual(["ok", "0.1000", "0.7000"]);
    expect(m.rows[1]).toEqual(["pending", "", ""]); // not yet analyzed → blank scores
  });
});

// A social-post block (ADR-0085): r1 reacted "love", shared, commented, and
// replied; r2 did none. Each engagement signal rides row.answers under its own
// key (reaction / spshared / spcomment / spreplies), set in getResults. The
// packed per-block column is dropped for social-post (owner: split into columns).
const withSocialPost: ResultsSummary = {
  ...results,
  questions: [
    results.questions[0],
    { ...results.questions[1], moduleKey: "social-post", prompt: "The post" },
  ],
  rows: [
    {
      ...results.rows[0],
      answers: {
        ...results.rows[0].answers,
        "reaction:q2": "love",
        "spshared:q2": "true",
        "spcomment:q2": "nice post",
        "spreplies:q2": '[re: Jan "hi"] agreed | same',
        "spcommentlikes:q2": 'Jan "hi"',
      },
    },
    {
      ...results.rows[1],
      answers: { ...results.rows[1].answers, "reaction:q2": "", "spshared:q2": "false", "spcomment:q2": "", "spreplies:q2": "", "spcommentlikes:q2": "" },
    },
  ],
};

describe("social-post split export columns (ADR-0085)", () => {
  it("emits dedicated reaction/shared/comment/replies columns; no packed column; none for non-social studies", () => {
    expect(baseColumns(results).some((c) => c.key.startsWith("reaction:"))).toBe(false);
    const cols = baseColumns(withSocialPost);
    // The packed per-block column (keyed by the raw instanceId) is gone for social-post.
    expect(cols.some((c) => c.key === "q2")).toBe(false);
    expect(cols.filter((c) => /^(reaction|spshared|spcomment|spreplies):q2$/.test(c.key)).map((c) => c.key)).toEqual([
      "reaction:q2",
      "spshared:q2",
      "spcomment:q2",
      "spreplies:q2",
    ]);
    expect(cols.find((c) => c.key === "reaction:q2")?.label).toBe("the_post_reaction");
    expect(cols.find((c) => c.key === "spshared:q2")?.label).toBe("the_post_shared");
    expect(cols.find((c) => c.key === "spcomment:q2")?.label).toBe("the_post_comment");
    // `liked` is intentionally not a column.
    expect(cols.some((c) => c.label.endsWith("_liked"))).toBe(false);
  });

  it("omits the replies column when nobody replied", () => {
    const noReplies: ResultsSummary = {
      ...withSocialPost,
      rows: withSocialPost.rows.map((r) => ({ ...r, answers: { ...r.answers, "spreplies:q2": "" } })),
    };
    expect(baseColumns(noReplies).some((c) => c.key === "spreplies:q2")).toBe(false);
  });

  it("emits a comment-likes column only when someone liked a comment (ADR-0085 am.)", () => {
    expect(baseColumns(withSocialPost).find((c) => c.key === "spcommentlikes:q2")?.label).toBe("the_post_comment_likes");
    const none: ResultsSummary = {
      ...withSocialPost,
      rows: withSocialPost.rows.map((r) => ({ ...r, answers: { ...r.answers, "spcommentlikes:q2": "" } })),
    };
    expect(baseColumns(none).some((c) => c.key === "spcommentlikes:q2")).toBe(false);
  });

  it("buildMatrix fills each engagement column, blank when none", () => {
    const cols = baseColumns(withSocialPost).filter((c) => /:q2$/.test(c.key));
    const m = buildMatrix(withSocialPost, cols);
    expect(m.headers).toEqual(["the_post_reaction", "the_post_shared", "the_post_comment", "the_post_replies", "the_post_comment_likes"]);
    expect(m.rows[0]).toEqual(["love", "true", "nice post", '[re: Jan "hi"] agreed | same', 'Jan "hi"']);
    expect(m.rows[1]).toEqual(["", "false", "", "", ""]);
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

// A pooled multi-version dataset (ADR-0044): r1 took v1, r2 took v2. The export
// must carry a per-row `version` column so the pool is disambiguable.
const pooled: ResultsSummary = {
  ...results,
  versionNumber: 2,
  selectedVersion: null,
  availableVersions: [2, 1],
  rows: [
    { ...results.rows[0], versionNumber: 1 },
    { ...results.rows[1], versionNumber: 2 },
  ],
};

describe("version column for pooled multi-version exports (ADR-0044)", () => {
  it("emits a `version` meta column reflecting each respondent's version", () => {
    const cols = baseColumns(pooled).filter((c) => c.key === "responseId" || c.key === "versionNumber");
    const m = buildMatrix(pooled, cols);
    expect(m.headers).toEqual(["response_id", "version"]);
    expect(m.rows).toEqual([["r1", "1"], ["r2", "2"]]);
  });

  it("JSON + dictionary include the version variable", () => {
    const cols = baseColumns(pooled);
    const json = JSON.parse(toJSON(pooled, cols));
    expect(json[0].version).toBe("1");
    expect(json[1].version).toBe("2");
    expect(dataDictionary(cols).variables.find((v) => v.name === "version")?.source).toBe("Version");
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

  it("notification/modal → dedicated action/time/screen columns; packed column excluded (ADR-0097)", () => {
    const r: ResultsSummary = {
      ...results,
      questions: [
        { instanceId: "notif1", prompt: "System alert", moduleKey: "notification", n: 2, kind: "text", mean: null, optionCounts: [] },
      ],
      rows: [
        { ...results.rows[0], answers: { "notifaction:notif1": "dismissed", "notifatms:notif1": "1200", "notifscreen:notif1": "3" } },
        { ...results.rows[1], answers: { "notifaction:notif1": "ignored", "notifatms:notif1": "0", "notifscreen:notif1": "1" } },
      ],
    };
    const cols = baseColumns(r);
    const keys = cols.map((c) => c.key);
    expect(keys).not.toContain("notif1"); // packed per-block column excluded
    expect(keys).toContain("notifaction:notif1");
    expect(keys).toContain("notifatms:notif1");
    expect(keys).toContain("notifscreen:notif1");
    expect(cols.find((c) => c.key === "notifaction:notif1")?.type).toBe("categorical");
    expect(cols.find((c) => c.key === "notifaction:notif1")?.label).toBe("system_alert_action");
    expect(cols.find((c) => c.key === "notifatms:notif1")?.type).toBe("numeric");
    const m = buildMatrix(r, cols.filter((c) => c.key.startsWith("notif")));
    expect(m.rows).toEqual([
      ["dismissed", "1200", "3"],
      ["ignored", "0", "1"],
    ]);
  });

  it("always lists the notification action-screen column so it's visible while designing (owner 2026-07-06)", () => {
    const r: ResultsSummary = {
      ...results,
      questions: [{ instanceId: "notif1", prompt: "Alert", moduleKey: "notification", n: 0, kind: "text", mean: null, optionCounts: [] }],
      rows: [],
    };
    const keys = baseColumns(r).map((c) => c.key);
    expect(keys).toContain("notifaction:notif1");
    expect(keys).toContain("notifatms:notif1");
    expect(keys).toContain("notifscreen:notif1"); // present even with no rows
  });
});
