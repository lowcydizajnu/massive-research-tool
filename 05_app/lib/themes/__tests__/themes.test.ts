import { describe, expect, it } from "vitest";

import {
  ACADEMIC,
  THEME_PRESETS,
  readTheme,
  studyThemeSchema,
  themeToCssVars,
} from "@/lib/themes/themes";

describe("study themes (ADR-0024)", () => {
  it("every preset passes its own schema", () => {
    for (const p of Object.values(THEME_PRESETS)) {
      expect(studyThemeSchema.safeParse(p).success).toBe(true);
    }
  });

  it("readTheme falls back to Academic for missing/invalid themes", () => {
    expect(readTheme({})).toEqual(ACADEMIC);
    expect(readTheme(undefined)).toEqual(ACADEMIC);
    expect(readTheme({ theme: { presetKey: "evil", colors: {} } })).toEqual(ACADEMIC);
    expect(readTheme({ theme: THEME_PRESETS.clinical })).toEqual(THEME_PRESETS.clinical);
  });

  it("rejects non-allowlisted values (arbitrary CSS / fonts can't sneak in)", () => {
    const bad = structuredClone(ACADEMIC) as Record<string, never> & typeof ACADEMIC;
    expect(studyThemeSchema.safeParse({ ...bad, colors: { ...bad.colors, page: "url(x)" } }).success).toBe(false);
    expect(
      studyThemeSchema.safeParse({
        ...bad,
        typography: { ...bad.typography, bodyFont: "Comic Sans, evil" },
      }).success,
    ).toBe(false);
  });

  it("resolves to the take surface's token names, deterministically", () => {
    const vars = themeToCssVars(ACADEMIC);
    expect(vars["--color-surface-page"]).toBe("#F7F2E8");
    expect(vars["--color-primary"]).toBe("#1747C9");
    expect(vars["--font-serif"]).toContain("IBM Plex Serif");
    expect(vars["--radius-md"]).toBe("8px");
    expect(vars["--take-card-pad"]).toBe("2rem");
    expect(themeToCssVars(ACADEMIC)).toEqual(vars);
    expect(themeToCssVars(THEME_PRESETS.modern)["--radius-md"]).toBe("0px");
  });
});

import { PRESET_WARNINGS, requiresAcknowledgment } from "@/lib/themes/themes";
import { getBlockOverride } from "@/components/feature/take/block-overrides";

describe("mimicking presets (Wave 5 quartet, ADR-0024)", () => {
  it("quartet presets exist, validate, and carry warnings; baselines carry none", () => {
    for (const key of ["facebook", "x", "news", "business", "instagram", "tiktok", "lifestyle", "forum", "blog"] as const) {
      expect(studyThemeSchema.safeParse(THEME_PRESETS[key]).success).toBe(true);
      expect(PRESET_WARNINGS[key].length).toBeGreaterThan(0);
    }
    for (const key of ["academic", "clinical", "modern", "playful", "custom"] as const) {
      expect(PRESET_WARNINGS[key]).toEqual([]);
    }
  });

  it("requiresAcknowledgment gates mimicking presets until acknowledged", () => {
    expect(requiresAcknowledgment(THEME_PRESETS.facebook)).toBe(true);
    expect(requiresAcknowledgment({ ...THEME_PRESETS.facebook, mimicAcknowledged: true })).toBe(false);
    expect(requiresAcknowledgment(THEME_PRESETS.academic)).toBe(false);
  });

  it("block-override contract: facebook/x restyle social-post; others fall back", () => {
    expect(getBlockOverride("facebook", "social-post")).not.toBeNull();
    expect(getBlockOverride("x", "social-post")).not.toBeNull();
    expect(getBlockOverride("instagram", "social-post")).not.toBeNull();
    expect(getBlockOverride("forum", "social-post")).not.toBeNull();
    expect(getBlockOverride("facebook", "likert-7")).toBeNull();
    expect(getBlockOverride("academic", "social-post")).toBeNull();
    expect(getBlockOverride(undefined, "social-post")).toBeNull();
  });
});

import { effectivePresetKey } from "@/lib/themes/themes";

describe("effectivePresetKey (custom keeps the base preset's behaviour)", () => {
  it("custom themes inherit the base preset's post styling + warning gate", () => {
    const customized = { ...THEME_PRESETS.facebook, presetKey: "custom" as const, basePresetKey: "facebook" as const };
    expect(effectivePresetKey(customized)).toBe("facebook");
    expect(getBlockOverride(effectivePresetKey(customized), "social-post")).not.toBeNull();
    expect(requiresAcknowledgment(customized)).toBe(true);
    expect(requiresAcknowledgment({ ...customized, mimicAcknowledged: true })).toBe(false);
  });
  it("plain custom (no base) has no override and no gate", () => {
    const plain = { ...THEME_PRESETS.academic, presetKey: "custom" as const };
    expect(effectivePresetKey(plain)).toBe("custom");
    expect(requiresAcknowledgment(plain)).toBe(false);
  });
});
