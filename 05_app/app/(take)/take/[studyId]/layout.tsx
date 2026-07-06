import type { CSSProperties } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { experiment, experimentVersion } from "@/server/db/schema";
import { WIDTHS, effectivePresetKey, readTheme, resolveSocialPost, showsPlatformChrome, themeColorScheme, themeToCssVars } from "@/lib/themes/themes";
import { getPageFrame } from "@/components/feature/take/page-frames";

/**
 * Per-study themed shell for the participant runtime (ADR-0024). Resolves the
 * study's theme SERVER-SIDE to CSS-variable overrides of the same tokens the
 * take components consume — no client-side switching (ADR-0013). Reads the
 * study's current version at render (frozen-per-session theming is an ADR-0024
 * revisit trigger). Unknown study → Academic defaults; pages still 404 properly.
 */
export default async function ThemedTakeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  let snapshot: unknown = undefined;
  try {
    const [row] = await db
      .select({ snapshot: experimentVersion.definitionSnapshot })
      .from(experiment)
      .innerJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
      .where(eq(experiment.id, studyId))
      .limit(1);
    snapshot = row?.snapshot;
  } catch {
    /* malformed id etc. — fall through to defaults; the page itself 404s */
  }
  const theme = readTheme(snapshot ?? {});
  const vars = themeToCssVars(theme) as CSSProperties;
  // Page-level platform chrome (ADR-0024, Wave 5c): decorative + inert. The
  // social branding tier (ADR-0084) suppresses it when set to "block", and the
  // Facebook frame drops its trademarked logo/wordmark unless the study default
  // tier is fully "branded" (so an "inspired"/layout study stays generic).
  const Frame = showsPlatformChrome(theme)
    ? getPageFrame(effectivePresetKey(theme), { branded: resolveSocialPost(theme).brandingTierDefault === "branded" })
    : null;

  return (
    <div
      // `--take-content-max` = the study's content column width, so page-level
      // top-bar elements (notification banner) can align to the content below
      // instead of stretching full-bleed (owner 2026-07-06).
      style={{ ...vars, colorScheme: themeColorScheme(theme), ["--take-content-max" as string]: WIDTHS[theme.layout.width] }}
      className="flex min-h-screen flex-col items-center bg-[var(--color-surface-page)] font-sans text-[var(--color-text-primary)]"
    >
      {Frame ? (
        <div aria-hidden className="pointer-events-none w-full">
          {Frame()}
        </div>
      ) : null}
      {/* Page-level slot for the interaction gate (timer + requirement chips) — a
          full-width sticky bar directly under the fake nav, so the gate belongs to
          the PAGE like the nav, not boxed inside a post (owner 2026-07-01). The
          InteractionGate portals its bar here; empty:hidden means zero footprint
          on screens without a gate. */}
      <div id="take-topbar" className="sticky top-0 z-30 w-full empty:hidden" />
      <main className="w-full px-0 py-6 sm:px-4 sm:py-10" style={{ maxWidth: WIDTHS[theme.layout.width] }}>
        {children}
      </main>
    </div>
  );
}
