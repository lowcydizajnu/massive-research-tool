import { describe, expect, it } from "vitest";

import { BUBBLE_TOKENS, RADIUS_PX, resolveChat, studyThemeSchema } from "@/lib/themes/themes";

describe("resolveChat (ADR-0065 chat appearance)", () => {
  it("fills every default when the theme has no chat", () => {
    const c = resolveChat({});
    expect(c.assistantName).toBe("Assistant");
    expect(c.avatarKey).toBeNull();
    expect(c.participantLabel).toBe("You");
    expect(c.assistantBubble).toBe("surface");
    expect(c.participantBubble).toBe("accent");
    expect(c.bubbleRadius).toBe("rounded");
    expect(c.aiDisclosure).toBe(true);
    expect(c.typingIndicator).toBe(true);
    expect(c.font).toBeUndefined();
  });

  it("merges a partial chat over the defaults", () => {
    const c = resolveChat({ chat: { assistantName: "Robo", aiDisclosure: false } });
    expect(c.assistantName).toBe("Robo");
    expect(c.aiDisclosure).toBe(false);
    expect(c.participantLabel).toBe("You"); // default preserved
  });

  it("theme.chat is optional on the schema (older themes parse fine)", () => {
    const parsed = studyThemeSchema.safeParse({
      presetKey: "academic",
      colors: { page: "#fff", card: "#fff", text: "#000", muted: "#888", accent: "#123456" },
      typography: { headingFont: "plex-serif", bodyFont: "plex-sans", baseSize: "M" },
      shape: { radius: "rounded", density: "normal" },
      layout: { width: "medium", progress: "bar", backButton: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("bubble tones + radii map to concrete values", () => {
    expect(BUBBLE_TOKENS.accent.bg).toContain("--color-primary");
    expect(RADIUS_PX.rounded).toBe("16px");
    expect(RADIUS_PX.sharp).toBe("4px");
  });
});
