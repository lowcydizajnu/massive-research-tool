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
