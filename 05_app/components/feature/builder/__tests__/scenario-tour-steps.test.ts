import { describe, expect, it } from "vitest";

import {
  SCENARIO_TOUR_SLUGS,
  SCENARIO_TOUR_STEPS,
  scenarioTourFor,
} from "../scenario-tour-steps";

describe("scenarioTourFor", () => {
  it("returns the slug for each Builder-landing scenario", () => {
    for (const slug of SCENARIO_TOUR_SLUGS) {
      expect(scenarioTourFor(slug)).toBe(slug);
    }
  });

  it("returns null for the browse-only scenario, unknown, empty, and nullish", () => {
    expect(scenarioTourFor("replicate-published")).toBeNull();
    expect(scenarioTourFor("not-a-scenario")).toBeNull();
    expect(scenarioTourFor("")).toBeNull();
    expect(scenarioTourFor(null)).toBeNull();
    expect(scenarioTourFor(undefined)).toBeNull();
  });
});

describe("SCENARIO_TOUR_STEPS", () => {
  it("defines a handful of steps for every tour scenario, all with content", () => {
    for (const slug of SCENARIO_TOUR_SLUGS) {
      const steps = SCENARIO_TOUR_STEPS[slug];
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps.length).toBeLessThanOrEqual(9);
      for (const step of steps) {
        expect(step.target).toBeTruthy();
        expect(step.content).toBeTruthy();
      }
    }
  });

  it("only targets anchors that exist on first Builder load", () => {
    const allowed = new Set([
      "body",
      '[data-tour="builder-blocks"]',
      '[data-tour="builder-conditions"]',
      '[data-tour="builder-preview"]',
      '[data-tour="builder-save"]',
      '[data-tour="builder-add-block"]',
      '[data-tour="stage-design"]',
      '[data-tour="stage-run"]',
      '[data-tour="stage-results"]',
    ]);
    for (const slug of SCENARIO_TOUR_SLUGS) {
      for (const step of SCENARIO_TOUR_STEPS[slug]) {
        expect(allowed.has(step.target as string)).toBe(true);
      }
    }
  });
});
