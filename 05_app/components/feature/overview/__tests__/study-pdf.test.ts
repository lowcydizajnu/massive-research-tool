import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { StudyPdfDocument, type StudyPdfData } from "@/components/feature/overview/study-pdf";

const base: StudyPdfData = {
  title: "What makes a headline credible?",
  author: { name: "Hanna Kowalczyk", affiliation: "Jagiellonian University", orcid: "0000-0002-1825-0097" },
  status: "Preregistered",
  versionLabel: "v3",
  abstract: "A study of warning labels and perceived credibility.\n\nTwo conditions.",
  hypotheses: ["Warnings reduce perceived credibility.", "The effect is larger for older adults."],
  sections: [{ heading: "Methods", contentMd: "Between-subjects design.\n\n200 participants." }],
  blocks: [
    { name: "Post 1", ref: "social-post · 2.0.0" },
    { name: "Credibility", ref: "likert-7 · 1.0.0", prompt: "How credible is this?" },
  ],
  prereg: { doi: "10.17605/OSF.IO/ABC12", url: "https://osf.io/abc12" },
  year: 2026,
};

const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

describe("StudyPdfDocument (V1.12 B2, ADR-0027)", () => {
  it("renders a valid PDF buffer", async () => {
    const buf = await renderToBuffer(createElement(StudyPdfDocument, { data: base }));
    expect(buf.length).toBeGreaterThan(800);
    expect(isPdf(buf)).toBe(true);
  });

  it("renders with empty/minimal data (no overview, no prereg, no author)", async () => {
    const buf = await renderToBuffer(
      createElement(StudyPdfDocument, {
        data: { ...base, abstract: "", hypotheses: [], sections: [], blocks: [], prereg: null, author: { name: "", affiliation: null, orcid: null } },
      }),
    );
    expect(isPdf(buf)).toBe(true);
  });
});
