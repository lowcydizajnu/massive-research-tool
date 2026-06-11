import type { CSSProperties } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { experiment, experimentVersion } from "@/server/db/schema";
import { WIDTHS, readTheme, themeToCssVars } from "@/lib/themes/themes";

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

  return (
    <div
      style={vars}
      className="flex min-h-screen justify-center bg-[var(--color-surface-page)] px-4 py-10 font-sans text-[var(--color-text-primary)]"
    >
      <main className="w-full" style={{ maxWidth: WIDTHS[theme.layout.width] }}>
        {children}
      </main>
    </div>
  );
}
