import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

describe("module response schemas (ADR-0014 answer validation)", () => {
  it("social-post is a pure stimulus — collects no response", () => {
    const m = getModuleDef("core", "social-post", "1.0.0")!;
    expect(m.collectsResponse).toBe(false);
    expect(m.responseSchema).toBeNull();
  });

  it("likert-7 collects an integer 1..7 and rejects out-of-range / non-integer / empty", () => {
    const m = getModuleDef("core", "likert-7", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    const schema = m.responseSchema!;

    expect(schema.safeParse({ value: 1 }).success).toBe(true);
    expect(schema.safeParse({ value: 7 }).success).toBe(true);
    expect(schema.safeParse({ value: 4 }).success).toBe(true);

    expect(schema.safeParse({ value: 0 }).success).toBe(false);
    expect(schema.safeParse({ value: 8 }).success).toBe(false);
    expect(schema.safeParse({ value: 3.5 }).success).toBe(false);
    expect(schema.safeParse({ value: "4" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("social-post v2.0.0 adds veracity + tags; collects engagement interactions (ADR-0024)", () => {
    const m = getModuleDef("core", "social-post", "2.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema).not.toBeNull();
    expect(m.configSchema.safeParse({
      headline: "h", body: "b", source: "s",
      veracityGroundTruth: "misleading", topicTags: ["vaccines"],
      imageUrl: "", shareCountVisible: false,
    }).success).toBe(true);
    // veracity is an enum — a bad value is rejected.
    expect(m.configSchema.safeParse({
      headline: "h", body: "b", source: "s",
      veracityGroundTruth: "kinda-true", topicTags: [], imageUrl: "", shareCountVisible: false,
    }).success).toBe(false);
    // v1.0.0 is still resolvable for studies pinned to it.
    expect(getModuleDef("core", "social-post", "1.0.0")).toBeDefined();
  });

  it("multiple-choice: selected[] shape; empty selection counts as blank", () => {
    const m = getModuleDef("core", "multiple-choice", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema!.safeParse({ selected: ["a"] }).success).toBe(true);
    expect(m.responseSchema!.safeParse({ selected: [] }).success).toBe(true); // shape ok…
    expect(m.isAnswerEmpty!({ selected: [] })).toBe(true); // …but blank for required-check
    expect(m.isAnswerEmpty!({ selected: ["a"] })).toBe(false);
  });

  it("free-text: text shape; whitespace-only counts as blank", () => {
    const m = getModuleDef("core", "free-text", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema!.safeParse({ text: "hello" }).success).toBe(true);
    expect(m.isAnswerEmpty!({ text: "   " })).toBe(true);
    expect(m.isAnswerEmpty!({ text: "x" })).toBe(false);
  });

  it("slider: numeric value shape", () => {
    const m = getModuleDef("core", "slider", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ value: 42 }).success).toBe(true);
    expect(m.responseSchema!.safeParse({ value: "42" }).success).toBe(false);
    expect(m.isAnswerEmpty!({ value: 0 })).toBe(false);
    expect(m.isAnswerEmpty!({})).toBe(true);
  });

  it("ranking: order[] shape; empty order is blank", () => {
    const m = getModuleDef("core", "ranking", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ order: ["b", "a"] }).success).toBe(true);
    expect(m.isAnswerEmpty!({ order: [] })).toBe(true);
    expect(m.isAnswerEmpty!({ order: ["a"] })).toBe(false);
  });

  it("attention-check: single selection shape + a correct answer in config", () => {
    const m = getModuleDef("core", "attention-check", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ selected: ["Strongly agree"] }).success).toBe(true);
    expect((m.defaultConfig as { correctAnswer: string }).correctAnswer).toBe("Strongly agree");
    expect(m.isAnswerEmpty!({ selected: [] })).toBe(true);
  });

  it("demographics: optional fields; blank when none filled", () => {
    const m = getModuleDef("core", "demographics", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ age: "30", country: "PL" }).success).toBe(true);
    expect(m.isAnswerEmpty!({})).toBe(true);
    expect(m.isAnswerEmpty!({ gender: "Woman" })).toBe(false);
  });
});

describe("config-membership / range validation (PR-2 hardening)", () => {
  it("multiple-choice: selections must be among options; single-select caps at 1", () => {
    const m = getModuleDef("core", "multiple-choice", "1.0.0")!;
    const cfg = { options: ["A", "B", "C"], multiple: false };
    expect(m.validateAnswer!({ selected: ["B"] }, cfg)).toBe(true);
    expect(m.validateAnswer!({ selected: ["Z"] }, cfg)).toBe(false); // not an option
    expect(m.validateAnswer!({ selected: ["A", "B"] }, cfg)).toBe(false); // >1 on single
    expect(m.validateAnswer!({ selected: ["A", "B"] }, { options: ["A", "B"], multiple: true })).toBe(true);
  });

  it("slider: value must be within [min, max]", () => {
    const m = getModuleDef("core", "slider", "1.0.0")!;
    expect(m.validateAnswer!({ value: 50 }, { min: 0, max: 100 })).toBe(true);
    expect(m.validateAnswer!({ value: 150 }, { min: 0, max: 100 })).toBe(false);
  });

  it("ranking: ranked entries must be among the items", () => {
    const m = getModuleDef("core", "ranking", "1.0.0")!;
    expect(m.validateAnswer!({ order: ["b", "a"] }, { items: ["a", "b"] })).toBe(true);
    expect(m.validateAnswer!({ order: ["x"] }, { items: ["a", "b"] })).toBe(false);
  });

  it("attention-check: the selection must be one of the options", () => {
    const m = getModuleDef("core", "attention-check", "1.0.0")!;
    const cfg = { options: ["Disagree", "Agree"], correctAnswer: "Agree" };
    expect(m.validateAnswer!({ selected: ["Agree"] }, cfg)).toBe(true);
    expect(m.validateAnswer!({ selected: ["Maybe"] }, cfg)).toBe(false);
  });

  it("bounds: free-text caps at 10k chars; mc selection strings cap at 500", () => {
    const ft = getModuleDef("core", "free-text", "1.0.0")!;
    expect(ft.responseSchema!.safeParse({ text: "x".repeat(10001) }).success).toBe(false);
    const mc = getModuleDef("core", "multiple-choice", "1.0.0")!;
    expect(mc.responseSchema!.safeParse({ selected: ["x".repeat(501)] }).success).toBe(false);
  });
});

import { getModuleDef as getDef } from "@/server/modules/registry";

describe("social-post v2 engagement interactions (ADR-0024)", () => {
  const def = getDef("core", "social-post", "2.0.0")!;
  it("collects an interaction answer; v1 stays a pure stimulus", () => {
    expect(def.collectsResponse).toBe(true);
    expect(def.responseSchema!.safeParse({ liked: true, shared: false }).success).toBe(true);
    expect(def.responseSchema!.safeParse({ liked: true, shared: false, comment: "lol" }).success).toBe(true);
    expect(getDef("core", "social-post", "1.0.0")!.collectsResponse).toBe(false);
  });
  it("never blocks the participant (interaction is optional)", () => {
    expect(def.isAnswerEmpty!({ liked: false, shared: false })).toBe(false);
  });
  it("single-reaction mode rejects liking AND sharing together", () => {
    expect(def.validateAnswer!({ liked: true, shared: true }, { singleReaction: true })).toBe(false);
    expect(def.validateAnswer!({ liked: true, shared: false }, { singleReaction: true })).toBe(true);
    expect(def.validateAnswer!({ liked: true, shared: true }, { singleReaction: false })).toBe(true);
  });
  it("rejects a comment when the researcher disabled comments", () => {
    expect(def.validateAnswer!({ liked: false, shared: false, comment: "hi" }, { allowComments: false })).toBe(false);
    expect(def.validateAnswer!({ liked: false, shared: false }, { allowComments: false })).toBe(true);
    expect(def.validateAnswer!({ liked: false, shared: false, comment: "hi" }, { allowComments: true })).toBe(true);
  });
  it("default config carries engagement controls (no legacy shareCountVisible)", () => {
    expect(def.configSchema.safeParse(def.defaultConfig).success).toBe(true);
    expect("likesCount" in def.defaultConfig && "allowComments" in def.defaultConfig).toBe(true);
    expect("shareCountVisible" in def.defaultConfig).toBe(false);
  });
});

describe("audio-record (handoff C2 Group 3)", () => {
  const a = getDef("core", "audio-record", "1.0.0")!;
  it("collects {r2Key, durationMs}; keys must live under resp/", () => {
    expect(a.collectsResponse).toBe(true);
    expect(a.responseSchema!.safeParse({ r2Key: "resp/01H/clip.webm", durationMs: 5000 }).success).toBe(true);
    expect(a.responseSchema!.safeParse({ r2Key: "ws/steal/other.webm", durationMs: 5000 }).success).toBe(false);
  });
  it("empty without a recording; duration capped by config (+slack)", () => {
    expect(a.isAnswerEmpty!({})).toBe(true);
    expect(a.isAnswerEmpty!({ r2Key: "resp/x/y.webm" })).toBe(false);
    expect(a.validateAnswer!({ r2Key: "resp/x/y.webm", durationMs: 61_000 }, { maxDurationSeconds: 60 })).toBe(true);
    expect(a.validateAnswer!({ r2Key: "resp/x/y.webm", durationMs: 70_000 }, { maxDurationSeconds: 60 })).toBe(false);
  });
});

describe("media URL fields accept uploaded-asset paths (ADR-0003)", () => {
  const cases = [
    ["image", "1.0.0", "url"],
    ["video", "1.0.0", "url"],
    ["social-post", "2.0.0", "imageUrl"],
  ] as const;
  it("accepts /api/media/ws/… and https; keeps junk out", () => {
    for (const [key, version, field] of cases) {
      const schema = getDef("core", key, version)!.configSchema;
      const base = getDef("core", key, version)!.defaultConfig;
      expect(schema.safeParse({ ...base, [field]: "/api/media/ws/abc/01H.png" }).success).toBe(true);
      expect(schema.safeParse({ ...base, [field]: "https://example.org/x.png" }).success).toBe(true);
      expect(schema.safeParse({ ...base, [field]: "/etc/passwd" }).success).toBe(false);
    }
  });
  it("link block stays external-URL-only", () => {
    const link = getDef("core", "link", "1.0.0")!;
    expect(link.configSchema.safeParse({ ...link.defaultConfig, url: "/api/media/ws/a/b.png" }).success).toBe(false);
  });
});

describe("Wave 1 choice & judgment blocks (block-expansion plan, 2026-06-13)", () => {
  it("accuracy-confidence: accuracy ∈ options, confidence in range", () => {
    const d = getDef("core", "accuracy-confidence", "1.0.0")!;
    expect(d.collectsResponse).toBe(true);
    const cfg = { options: ["Real", "Fake"], confidenceMax: 100, required: true };
    expect(d.validateAnswer!({ accuracy: "Real", confidence: 80 }, cfg)).toBe(true);
    expect(d.validateAnswer!({ accuracy: "Maybe", confidence: 80 }, cfg)).toBe(false);
    expect(d.validateAnswer!({ accuracy: "Real", confidence: 150 }, cfg)).toBe(false);
    expect(d.isAnswerEmpty!({ accuracy: "" })).toBe(true);
  });
  it("share-intention: whyRequired only bites once an intention is chosen", () => {
    const d = getDef("core", "share-intention", "1.0.0")!;
    const cfg = { options: ["No", "Yes"], whyRequired: true };
    expect(d.validateAnswer!({ intention: "Yes", why: "credible" }, cfg)).toBe(true);
    expect(d.validateAnswer!({ intention: "Yes" }, cfg)).toBe(false);
    expect(d.validateAnswer!({ intention: "" }, cfg)).toBe(true); // no choice → why not required
  });
  it("constant-sum: total enforced only when allocated; stray/negative rejected", () => {
    const d = getDef("core", "constant-sum", "1.0.0")!;
    const cfg = { items: ["A", "B", "C"], total: 100 };
    expect(d.validateAnswer!({ values: { "0": 50, "1": 50 } }, cfg)).toBe(true);
    expect(d.validateAnswer!({ values: { "0": 40, "1": 40 } }, cfg)).toBe(false); // ≠100
    expect(d.validateAnswer!({ values: { "9": 100 } }, cfg)).toBe(false); // stray index
    expect(d.validateAnswer!({ values: { "0": -10, "1": 110 } }, cfg)).toBe(false); // negative
    expect(d.validateAnswer!({ values: {} }, cfg)).toBe(true); // empty allowed
  });
  it("drill-down: a path must walk the configured tree", () => {
    const d = getDef("core", "drill-down", "1.0.0")!;
    const cfg = { options: [{ label: "PL", children: [{ label: "Mazovia", children: [{ label: "Warsaw" }] }] }] };
    expect(d.validateAnswer!({ path: ["PL", "Mazovia", "Warsaw"] }, cfg)).toBe(true);
    expect(d.validateAnswer!({ path: ["PL", "Pomerania"] }, cfg)).toBe(false);
    expect(d.isAnswerEmpty!({ path: [] })).toBe(true);
  });
  it("side-by-side: cell keys must be row_col with known col + valid option", () => {
    const d = getDef("core", "side-by-side", "1.0.0")!;
    const cfg = { rows: ["r0", "r1"], columns: [{ key: "trust", label: "Trust", options: ["Low", "High"] }] };
    expect(d.validateAnswer!({ values: { "0_trust": "Low", "1_trust": "High" } }, cfg)).toBe(true);
    expect(d.validateAnswer!({ values: { "0_trust": "Maybe" } }, cfg)).toBe(false); // bad option
    expect(d.validateAnswer!({ values: { "5_trust": "Low" } }, cfg)).toBe(false); // bad row
    expect(d.validateAnswer!({ values: { "0_nope": "Low" } }, cfg)).toBe(false); // bad col
  });
});

describe("Wave 2 timing blocks (ADR-0040, 2026-06-13)", () => {
  it("timed-exposure: collects shownMs, never blank, shape-checks only", () => {
    const d = getDef("core", "timed-exposure", "1.0.0")!;
    expect(d.collectsResponse).toBe(true);
    expect(d.isAnswerEmpty!({})).toBe(false); // timing never blocks a required check
    expect(d.validateAnswer!({ shownMs: 1980 }, {})).toBe(true);
    expect(d.validateAnswer!({ shownMs: -1 }, {})).toBe(false);
    expect(d.isComplete({ exposureMs: 2000 })).toBe(true);
    expect(d.isComplete({ exposureMs: 0 })).toBe(false);
  });
  it("forced-wait: collects waitedMs, never blank", () => {
    const d = getDef("core", "forced-wait", "1.0.0")!;
    expect(d.isAnswerEmpty!({})).toBe(false);
    expect(d.validateAnswer!({ waitedMs: 5000 }, {})).toBe(true);
    expect(d.validateAnswer!({ waitedMs: "x" }, {})).toBe(false);
    expect(d.isComplete({ waitSeconds: 5 })).toBe(true);
  });
});

describe("Wave 3 image-interaction blocks (ADR-0041, 2026-06-13)", () => {
  it("heat-map: points capped by maxPoints; empty when none", () => {
    const d = getDef("core", "heat-map", "1.0.0")!;
    expect(d.isAnswerEmpty!({ points: [] })).toBe(true);
    expect(d.validateAnswer!({ points: [{ x: 0.1, y: 0.2 }] }, { maxPoints: 3 })).toBe(true);
    expect(d.validateAnswer!({ points: [1, 2, 3, 4].map(() => ({ x: 0, y: 0 })) }, { maxPoints: 3 })).toBe(false);
  });
  it("hot-spot: selected ∈ region keys; single vs multiple enforced", () => {
    const d = getDef("core", "hot-spot", "1.0.0")!;
    const cfg = { regions: [{ key: "r1" }, { key: "r2" }], multiple: false };
    expect(d.validateAnswer!({ selected: ["r1"] }, cfg)).toBe(true);
    expect(d.validateAnswer!({ selected: ["r1", "r2"] }, cfg)).toBe(false); // single
    expect(d.validateAnswer!({ selected: ["x"] }, cfg)).toBe(false); // stray
    expect(d.validateAnswer!({ selected: ["r1", "r2"] }, { ...cfg, multiple: true })).toBe(true);
  });
  it("graphic-slider: value in 0..1", () => {
    const d = getDef("core", "graphic-slider", "1.0.0")!;
    expect(d.validateAnswer!({ value: 0.42 }, {})).toBe(true);
    expect(d.validateAnswer!({ value: 1.5 }, {})).toBe(false);
    expect(d.isAnswerEmpty!({})).toBe(true);
  });
  it("signature: r2Key must be a resp/ key; empty otherwise", () => {
    const d = getDef("core", "signature", "1.0.0")!;
    expect(d.responseSchema!.safeParse({ r2Key: "resp/01H/sig.png" }).success).toBe(true);
    expect(d.responseSchema!.safeParse({ r2Key: "ws/x/sig.png" }).success).toBe(false);
    expect(d.isAnswerEmpty!({ r2Key: "" })).toBe(true);
  });
});

describe("Wave 4 media-upload blocks (ADR-0003 am., 2026-06-13)", () => {
  it("file-upload: r2Key must be a resp/ key; filename optional", () => {
    const d = getDef("core", "file-upload", "1.0.0")!;
    expect(d.responseSchema!.safeParse({ r2Key: "resp/01H/doc.pdf", filename: "report.pdf" }).success).toBe(true);
    expect(d.responseSchema!.safeParse({ r2Key: "ws/x/doc.pdf" }).success).toBe(false);
    expect(d.isAnswerEmpty!({ r2Key: "" })).toBe(true);
  });
  it("video-record: r2Key + duration capped by config (+slack)", () => {
    const d = getDef("core", "video-record", "1.0.0")!;
    expect(d.validateAnswer!({ r2Key: "resp/x/v.webm", durationMs: 60_000 }, { maxDurationSeconds: 60 })).toBe(true);
    expect(d.validateAnswer!({ r2Key: "resp/x/v.webm", durationMs: 90_000 }, { maxDurationSeconds: 60 })).toBe(false);
    expect(d.isAnswerEmpty!({})).toBe(true);
  });
});

describe("Wave 5 flow blocks (ADR-0042, 2026-06-13)", () => {
  it("embedded-data + end-redirect are stimulus (no response_item)", () => {
    expect(getDef("core", "embedded-data", "1.0.0")!.collectsResponse).toBe(false);
    expect(getDef("core", "end-redirect", "1.0.0")!.collectsResponse).toBe(false);
  });
  it("end-redirect isComplete needs a URL", () => {
    const d = getDef("core", "end-redirect", "1.0.0")!;
    expect(d.isComplete({ redirectUrl: "https://app.prolific.com/done" })).toBe(true);
    expect(d.isComplete({ redirectUrl: "" })).toBe(false);
  });
});
