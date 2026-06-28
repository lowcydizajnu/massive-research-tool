import { describe, expect, it } from "vitest";

import { describeEvent } from "@/lib/admin/posthog-events";

describe("describeEvent (ADR-0080 admin dashboard)", () => {
  it("maps PostHog built-ins to friendly labels + descriptions", () => {
    expect(describeEvent("$pageview").label).toBe("Page views");
    expect(describeEvent("$autocapture").description).toMatch(/automatically/i);
  });

  it("maps our taxonomy events", () => {
    expect(describeEvent("study_created").label).toBe("Studies created");
    expect(describeEvent("template_used").label).toBe("Templates used");
  });

  it("humanizes unknown events instead of showing a raw key", () => {
    expect(describeEvent("$some_new_thing").label).toBe("Some New Thing");
    expect(describeEvent("custom_event").label).toBe("Custom Event");
  });
});
