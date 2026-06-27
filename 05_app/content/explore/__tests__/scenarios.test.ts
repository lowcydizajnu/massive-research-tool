import { describe, expect, it } from "vitest";

import { getExploreScenarios } from "@/content/explore/scenarios";

describe("explore scenarios (EE1.2, ADR-0076)", () => {
  const scenarios = getExploreScenarios();

  it("returns scenarios sorted ascending by order", () => {
    const orders = scenarios.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it("every scenario has unique slug + a non-empty title/body + a valid CTA", () => {
    const slugs = new Set<string>();
    for (const s of scenarios) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(slugs.has(s.slug)).toBe(false);
      slugs.add(s.slug);
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
      expect(s.ctaLabel.trim().length).toBeGreaterThan(0);
      expect(["build", "browse", "template"]).toContain(s.cta.kind);
      if (s.cta.kind === "template") expect(s.cta.templateId.length).toBeGreaterThan(0);
    }
  });
});
