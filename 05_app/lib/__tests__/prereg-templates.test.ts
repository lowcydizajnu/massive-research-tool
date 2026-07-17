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
  /**
   * Was "exactly the two all-optional OSF schemas". Both halves of that were
   * wrong: Open-Ended's `summary` is required (ADR-0101 Am. 2), and the
   * all-optional rule — derived from that false premise — would have vetoed OSF
   * Preregistration, the template the owner actually asked for. ADR-0107
   * supersedes the scope; the real invariant is filler-or-home.
   */
  it("exposes the five curated templates, and nothing we cannot run", () => {
    expect(PREREG_TEMPLATE_KEYS).toEqual([
      "open-ended",
      "osf-preregistration",
      "as-predicted",
      "replication-recipe",
      "osf-standard-pre-data",
    ]);
    expect(isPreregTemplateKey("open-ended")).toBe(true);
    // Capability, not difficulty: we have no gaze or EEG hardware, so filing
    // these would preregister a method the platform cannot run (ADR-0106).
    expect(isPreregTemplateKey("eye-tracking")).toBe(false);
    expect(isPreregTemplateKey("eeg-erp")).toBe(false);
  });

  it("open-ended stays the default and its OSF binding is unchanged", () => {
    // No existing study may silently re-file under a different schema.
    expect(PREREG_TEMPLATES[0].key).toBe("open-ended");
    expect(PREREG_TEMPLATES[0].schemaName).toBe("Open-Ended Registration");
    expect(preregTemplate("replication-recipe").schemaName).toBe(
      "Replication Recipe (Brandt et al., 2014): Pre-Registration",
    );
  });

  it("every template carries the OSF binding the push needs", () => {
    for (const t of PREREG_TEMPLATES) {
      expect(t.schemaName.length).toBeGreaterThan(0);
      // Recorded for drift DETECTION, not selection — selection is by name
      // because filter[name] 400s. OSF revises schemas in place.
      expect(t.schemaId).toMatch(/^[0-9a-f]{24}$/);
      expect(t.schemaVersion).toBeGreaterThan(0);
      expect(t.questionCount).toBeGreaterThan(0);
      // Exact match only: "Character Lab Registration" vs "Character Lab
      // Registration " (trailing space) collide under any normalising match.
      expect(t.schemaName).toBe(t.schemaName.trim());
    }
  });

  it("only the generic-form templates ask OSF's own questions", () => {
    // Open-ended composes its summary; the Recipe maps 5 verified keys from
    // typed fields. The other three render live schema_blocks (ADR-0107 D1).
    expect(PREREG_TEMPLATES.filter((t) => t.asksOsfQuestions).map((t) => t.key)).toEqual([
      "osf-preregistration",
      "as-predicted",
      "osf-standard-pre-data",
    ]);
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
