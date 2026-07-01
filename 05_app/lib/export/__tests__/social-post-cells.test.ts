import { describe, expect, it } from "vitest";

import { formatCommentLikesCell, formatReplyCell } from "@/lib/export/social-post-cells";

describe("formatReplyCell (ADR-0085 am. — reply → which comment)", () => {
  it("prefixes each reply with the parent comment's label", () => {
    const cell = formatReplyCell([
      { to: 'Jan Kowalski "vaccines cause…"', text: "I disagree" },
      { to: "Maria", text: "source?" },
    ]);
    expect(cell).toBe('[re: Jan Kowalski "vaccines cause…"] I disagree | [re: Maria] source?');
  });

  it("renders a reply with no parent label as bare text", () => {
    expect(formatReplyCell([{ to: "", text: "no parent" }])).toBe("no parent");
  });

  it("accepts the legacy string[] shape (pre-amendment data)", () => {
    expect(formatReplyCell(["agreed", "same"])).toBe("agreed | same");
  });

  it("drops blank replies; a non-array is empty", () => {
    expect(formatReplyCell([{ to: "X", text: "   " }, { to: "Y", text: "keep" }])).toBe("[re: Y] keep");
    expect(formatReplyCell(undefined)).toBe("");
    expect(formatReplyCell(null)).toBe("");
    expect(formatReplyCell("nope")).toBe("");
  });
});

describe("formatCommentLikesCell (ADR-0085 am. — comment likes)", () => {
  it("joins the liked comments' labels", () => {
    expect(formatCommentLikesCell(['Jan "a…"', "Maria"])).toBe('Jan "a…" | Maria');
  });

  it("drops blanks; a non-array is empty", () => {
    expect(formatCommentLikesCell(["", " Keep ", ""])).toBe("Keep");
    expect(formatCommentLikesCell(undefined)).toBe("");
  });
});
