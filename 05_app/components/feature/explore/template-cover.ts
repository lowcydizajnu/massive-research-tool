import {
  STARTER_AB_TEMPLATE_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_PILOT_TEMPLATE_ID,
} from "@/lib/system/starter";

/**
 * App-shipped starter cover art (ADR-0091). Product content committed to the
 * repo and keyed by the fixed starter template ids (ADR-0079) — not R2 blobs.
 * Assets live in `public/explore-covers/`. Starters without an entry here fall
 * through to `coverImageR2Key`, then to the gradient placeholder.
 *
 * Pure + client-safe (only depends on the starter id contract) so both the
 * Explore server component and its unit test can import it without dragging in
 * server-only module graph.
 */
const STARTER_TEMPLATE_COVERS: Record<string, string> = {
  [STARTER_MISINFO_TEMPLATE_ID]: "/explore-covers/misinfo.png",
  [STARTER_AB_TEMPLATE_ID]: "/explore-covers/ab.png",
  [STARTER_PILOT_TEMPLATE_ID]: "/explore-covers/pilot.png",
};

/**
 * Resolve a featured-template card's cover src, in precedence order (ADR-0091):
 * committed app-shipped starter asset → user-uploaded `coverImageR2Key` (served
 * via the `/api/media` gateway) → `null` (card falls back to the gradient).
 */
export function templateCoverSrc(t: {
  id: string;
  coverImageR2Key: string | null;
}): string | null {
  return (
    STARTER_TEMPLATE_COVERS[t.id] ??
    (t.coverImageR2Key ? `/api/media/${t.coverImageR2Key}` : null)
  );
}
