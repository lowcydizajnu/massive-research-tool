import { describe, expect, it } from "vitest";

import {
  answerValues,
  evaluateClause,
  evaluateCondition,
  normalizeCondition,
  operatorsForKey,
  isConditionSource,
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
    expect(isConditionSource("social-post")).toBe(false);
    expect(isConditionSource("likert-7")).toBe(true);
  });
});
