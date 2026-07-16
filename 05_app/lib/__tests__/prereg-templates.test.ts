import { describe, expect, it } from "vitest";

import {
  PREREG_TEMPLATES,
  PREREG_TEMPLATE_KEYS,
  defaultTemplateKey,
  isPreregTemplateKey,
  preregTemplate,
  templateAsks,
} from "@/lib/prereg-templates";

describe("preregistration templates (ADR-0101)", () => {
  it("exposes exactly the two all-optional OSF schemas in v1", () => {
    expect(PREREG_TEMPLATE_KEYS).toEqual(["open-ended", "replication-recipe"]);
    expect(isPreregTemplateKey("open-ended")).toBe(true);
    expect(isPreregTemplateKey("eye-tracking")).toBe(false);
  });

  it("derives the default from replication intent (back-compat with the old implicit rule)", () => {
    expect(defaultTemplateKey(undefined)).toBe("open-ended");
    expect(defaultTemplateKey(null)).toBe("open-ended");
    expect(defaultTemplateKey("direct")).toBe("replication-recipe");
  });

  it("falls back to the default for unknown keys rather than throwing", () => {
    expect(preregTemplate("nonsense").key).toBe("open-ended");
    expect(preregTemplate(null).key).toBe("open-ended");
  });

  /**
   * The bug the owner caught (2026-07-15): the picker changed nothing on screen.
   * A template MUST declare a distinct field set, or choosing one is a no-op the
   * researcher cannot tell from a broken control.
   */
  it("each template declares a DISTINCT field set — the picker must change the form", () => {
    const open = preregTemplate("open-ended").fields;
    const recipe = preregTemplate("replication-recipe").fields;
    expect(open).not.toEqual(recipe);
    // Recipe asks strictly more: its own three OSF questions on top of the shared set.
    for (const f of open) expect(recipe).toContain(f);
    expect(recipe.filter((f) => !open.includes(f)).sort()).toEqual(
      ["differences", "originalStudy", "targetEffect"].sort(),
    );
  });

  it("templateAsks gates the recipe-only fields", () => {
    for (const f of ["originalStudy", "targetEffect", "differences"] as const) {
      expect(templateAsks("replication-recipe", f)).toBe(true);
      expect(templateAsks("open-ended", f)).toBe(false);
    }
    // Shared fields are asked by both.
    for (const f of ["samplingPlan", "analysisPlan", "variables", "expectedOutcomes"] as const) {
      expect(templateAsks("open-ended", f)).toBe(true);
      expect(templateAsks("replication-recipe", f)).toBe(true);
    }
  });

  it("every declared field set is non-empty and free of duplicates", () => {
    for (const t of PREREG_TEMPLATES) {
      expect(t.fields.length).toBeGreaterThan(0);
      expect(new Set(t.fields).size).toBe(t.fields.length);
      expect(t.label.trim()).not.toBe("");
      expect(t.description.trim()).not.toBe("");
    }
  });
});
