import { describe, expect, it } from "vitest";

import { getLegalDoc } from "@/lib/legal/content";
import { SUBPROCESSORS, subprocessorLabel, subprocessorsMarkdownTable } from "@/lib/legal/subprocessors";

describe("sub-processor single source (legal-baseline LG5)", () => {
  it("renders a GFM table with a row per sub-processor", () => {
    const table = subprocessorsMarkdownTable();
    const lines = table.trim().split("\n");
    // header + separator + one row each
    expect(lines).toHaveLength(2 + SUBPROCESSORS.length);
    expect(lines[0]).toContain("Sub-processor");
  });

  it("qualifies bring-your-own-key providers in the label", () => {
    const anthropic = SUBPROCESSORS.find((s) => s.name === "Anthropic")!;
    const clerk = SUBPROCESSORS.find((s) => s.name === "Clerk")!;
    const hume = SUBPROCESSORS.find((s) => s.name === "Hume AI")!;
    expect(subprocessorLabel(anthropic)).toBe("Anthropic (your key)");
    expect(subprocessorLabel(hume)).toBe("Hume AI (your key, where enabled)");
    expect(subprocessorLabel(clerk)).toBe("Clerk");
  });

  it("is the SINGLE SOURCE — the Privacy Policy body contains every sub-processor row", () => {
    const body = getLegalDoc("privacy")?.body ?? "";
    expect(body).toContain(subprocessorsMarkdownTable());
    for (const s of SUBPROCESSORS) {
      expect(body).toContain(subprocessorLabel(s));
    }
  });
});
