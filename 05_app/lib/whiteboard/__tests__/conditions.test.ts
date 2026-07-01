import { describe, expect, it } from "vitest";

import {
  answerValues,
  clausesBrokenByOrder,
  conditionWithSources,
  evaluateClause,
  evaluateCondition,
  newlyBrokenByReorder,
  normalizeCondition,
  operatorsForKey,
  isConditionSource,
  summarizeCondition,
  type ConditionGroup,
} from "../conditions";

describe("answerValues", () => {
  it("normalizes module answer shapes", () => {
    expect(answerValues({ value: 5 })).toEqual(["5"]);
    expect(answerValues({ text: "Hi" })).toEqual(["Hi"]);
    expect(answerValues({ selected: ["a", "b"] })).toEqual(["a", "b"]);
    expect(answerValues(["x", "y"])).toEqual(["x", "y"]);
    expect(answerValues(null)).toEqual([]);
  });
  it("social-post branches on the chosen reaction only (owner decision)", () => {
    // liked+shared boolean pair identifies a social-post answer; value = reaction.
    expect(answerValues({ liked: true, shared: false, reaction: "wow", comment: "hi" })).toEqual(["wow"]);
    // No reaction → no value, so "is answered" (reacted at all) is false.
    expect(answerValues({ liked: false, shared: true })).toEqual([]);
  });
});

describe("social-post reaction conditions", () => {
  it("operatorsForKey exposes single-select operators; evaluateClause matches the reaction", () => {
    expect(operatorsForKey("social-post")).toEqual(["answered", "eq", "neq", "isAnyOf"]);
    const reacted = { liked: true, shared: false, reaction: "wow" };
    const noReaction = { liked: false, shared: false };
    expect(evaluateClause(reacted, "eq", ["wow"])).toBe(true);
    expect(evaluateClause(reacted, "eq", ["love"])).toBe(false);
    expect(evaluateClause(reacted, "isAnyOf", ["love", "wow"])).toBe(true);
    expect(evaluateClause(reacted, "answered", [])).toBe(true); // reacted at all
    expect(evaluateClause(noReaction, "answered", [])).toBe(false); // no reaction
  });

  it("a stray empty-string target never matches (older polluted data + no-reaction)", () => {
    // The builder used to seed value:[""] so a saved reaction condition could be
    // ["", "angry"]. That must still mean "only angry" — and an unreacted post
    // (the in-screen reveal's initial state) must stay hidden, not match "".
    const angry = { liked: true, shared: false, reported: false, reaction: "angry" };
    const noReaction = { liked: false, shared: false, reported: false };
    expect(evaluateClause(angry, "isAnyOf", ["", "angry"])).toBe(true);
    expect(evaluateClause(noReaction, "isAnyOf", ["", "angry"])).toBe(false);
    expect(evaluateClause({ liked: true, shared: false, reported: false, reaction: "like" }, "isAnyOf", ["", "angry"])).toBe(false);
  });
});

describe("evaluateClause", () => {
  it("numeric operators (likert {value})", () => {
    const a = { value: 5 };
    expect(evaluateClause(a, "eq", ["5"])).toBe(true);
    expect(evaluateClause(a, "neq", ["5"])).toBe(false);
    expect(evaluateClause(a, "gte", ["5"])).toBe(true);
    expect(evaluateClause(a, "gt", ["5"])).toBe(false);
    expect(evaluateClause(a, "lte", ["6"])).toBe(true);
    expect(evaluateClause(a, "between", ["4", "6"])).toBe(true);
    expect(evaluateClause(a, "between", ["1", "4"])).toBe(false);
  });
  it("single + multi + text operators", () => {
    expect(evaluateClause({ value: "Yes" }, "isAnyOf", ["Yes", "Maybe"])).toBe(true);
    expect(evaluateClause({ selected: ["a", "c"] }, "includesAny", ["c", "d"])).toBe(true);
    expect(evaluateClause({ selected: ["a"] }, "includesAny", ["c", "d"])).toBe(false);
    expect(evaluateClause({ text: "hello world" }, "contains", ["WORLD"])).toBe(true);
  });
  it("an unanswered source never matches", () => {
    expect(evaluateClause(undefined, "eq", ["5"])).toBe(false);
    expect(evaluateClause(null, "neq", ["5"])).toBe(false); // even neq is false when unanswered
  });
  it("branches on a hot-spot region selection (ADR-0043 — 'is <regionKey>')", () => {
    // hot-spot records {selected:[regionKey]}; answerValues extracts the key, so
    // 'is r2' matches when the participant clicked region r2 (single or multi).
    expect(evaluateClause({ selected: ["r2"] }, "eq", ["r2"])).toBe(true);
    expect(evaluateClause({ selected: ["r1"] }, "eq", ["r2"])).toBe(false);
    expect(evaluateClause({ selected: ["r1", "r2"] }, "eq", ["r2"])).toBe(true); // multi-select includes r2
  });
});

describe("evaluateCondition (AND/OR)", () => {
  const grp = (op: "and" | "or", clauses: ConditionGroup["clauses"]): ConditionGroup => ({ op, clauses });
  const answers = { a: { value: 5 }, b: { value: "Yes" } };
  it("flat / empty group is always visible", () => {
    expect(evaluateCondition(null, answers)).toBe(true);
    expect(evaluateCondition(grp("and", []), answers)).toBe(true);
  });
  it("AND requires all; OR requires one", () => {
    const c1 = { fromInstanceId: "a", operator: "gte" as const, value: ["5"] };
    const c2 = { fromInstanceId: "b", operator: "eq" as const, value: ["No"] };
    expect(evaluateCondition(grp("and", [c1, c2]), answers)).toBe(false); // c2 fails
    expect(evaluateCondition(grp("or", [c1, c2]), answers)).toBe(true); // c1 passes
  });
});

describe("normalizeCondition (legacy back-compat)", () => {
  it("converts legacy equality rules to an OR group", () => {
    const g = normalizeCondition(null, [{ fromInstanceId: "a", equals: "5" }]);
    expect(g).toEqual({ op: "or", clauses: [{ fromInstanceId: "a", operator: "eq", value: ["5"] }] });
  });
  it("prefers showIf when present", () => {
    const showIf: ConditionGroup = { op: "and", clauses: [{ fromInstanceId: "a", operator: "gt", value: ["3"] }] };
    expect(normalizeCondition(showIf, [{ fromInstanceId: "a", equals: "5" }])).toBe(showIf);
  });
});

describe("type-aware menus", () => {
  it("numeric for likert, options for choice, none for stimulus", () => {
    expect(operatorsForKey("likert-7")).toContain("between");
    expect(operatorsForKey("multiple-choice")).toContain("isAnyOf");
    expect(operatorsForKey("free-text")).toContain("contains");
    // social-post is now a valid source (branch on reaction); pure stimuli are not.
    expect(isConditionSource("social-post")).toBe(true);
    expect(isConditionSource("likert-7")).toBe(true);
    expect(isConditionSource("video")).toBe(false);
    expect(isConditionSource("image")).toBe(false);
  });
});

describe("flat 'answered' link + summary (V1.10.1)", () => {
  it("'answered' = source has any answer, ignores value", () => {
    expect(evaluateClause({ value: 3 }, "answered", [])).toBe(true);
    expect(evaluateClause({ selected: ["x"] }, "answered", [])).toBe(true);
    expect(evaluateClause(null, "answered", [])).toBe(false);
    expect(evaluateClause(undefined, "answered", [])).toBe(false);
  });
  it("'answered' leads every type-aware operator menu (flat by default)", () => {
    expect(operatorsForKey("likert-7")[0]).toBe("answered");
    expect(operatorsForKey("multiple-choice")[0]).toBe("answered");
    expect(operatorsForKey("free-text")[0]).toBe("answered");
  });
  it("summarizeCondition renders a readable tag", () => {
    const nameOf = (id: string) => ({ a: "Post 1", b: "Q2" })[id] ?? id;
    const g: ConditionGroup = {
      op: "or",
      clauses: [
        { fromInstanceId: "a", operator: "answered", value: [] },
        { fromInstanceId: "b", operator: "gte", value: ["5"] },
      ],
    };
    expect(summarizeCondition(g, nameOf)).toBe("Post 1 is answered OR Q2 is at least 5");
    expect(summarizeCondition(null, nameOf)).toBeNull();
  });
});

describe("source validity (reorder consistency, V1.10.2)", () => {
  const showIf: ConditionGroup = {
    op: "or",
    clauses: [
      { fromInstanceId: "a", operator: "answered", value: [] },
      { fromInstanceId: "c", operator: "eq", value: ["x"] },
    ],
  };
  it("conditionWithSources keeps only allowed (earlier) sources", () => {
    expect(conditionWithSources(showIf, null, new Set(["a", "c"]))?.clauses).toHaveLength(2);
    expect(conditionWithSources(showIf, null, new Set(["a"]))?.clauses).toEqual([
      { fromInstanceId: "a", operator: "answered", value: [] },
    ]);
    expect(conditionWithSources(showIf, null, new Set())).toBeNull();
  });
  it("clausesBrokenByOrder flags clauses whose source is not earlier", () => {
    // Order: target 'b' references 'a' (earlier, ok) and 'c' (later, broken).
    const broken = clausesBrokenByOrder([
      { instanceId: "a" },
      { instanceId: "b", showIf },
      { instanceId: "c" },
    ]);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ targetId: "b", clause: { fromInstanceId: "c" } });
  });
  it("nothing broken when every source is earlier", () => {
    expect(
      clausesBrokenByOrder([{ instanceId: "a" }, { instanceId: "c" }, { instanceId: "b", showIf }]),
    ).toHaveLength(0);
  });
});

describe("newlyBrokenByReorder (only warn about live conditions, V1.10.3)", () => {
  it("ignores clauses already broken in the current order", () => {
    // Current order: target 'k' (first) references 'lk' + 'sl' — already broken
    // (they come after 'k'). Post 'p' references 'sl' — valid now.
    const current = [
      { instanceId: "k", showIf: { op: "or" as const, clauses: [
        { fromInstanceId: "lk", operator: "neq" as const, value: ["3"] },
        { fromInstanceId: "sl", operator: "eq" as const, value: ["30"] },
      ] } },
      { instanceId: "lk" },
      { instanceId: "sl" },
      { instanceId: "p", showIf: { op: "and" as const, clauses: [
        { fromInstanceId: "sl", operator: "eq" as const, value: ["20"] },
      ] } },
    ];
    // Move 'p' above 'sl' → only "p: sl is 20" newly breaks; k's were already dead.
    const next = [current[0], current[1], current[3], current[2]];
    const broken = newlyBrokenByReorder(current, next);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ targetId: "p", clause: { fromInstanceId: "sl" } });
  });
  it("returns nothing when a reorder only shuffles already-dead clauses", () => {
    const current = [
      { instanceId: "k", showIf: { op: "or" as const, clauses: [
        { fromInstanceId: "sl", operator: "eq" as const, value: ["30"] },
      ] } },
      { instanceId: "sl" },
    ];
    // Swap them — k's clause was already broken (sl after k) and stays broken.
    expect(newlyBrokenByReorder(current, [current[1], current[0]])).toHaveLength(0);
  });
});
