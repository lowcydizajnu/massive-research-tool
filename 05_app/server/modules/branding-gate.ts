import { blockDisplay, readBlocks, type BlockInstance } from "@/server/modules/blocks";
import { effectiveBrandingTier, readTheme, resolveSocialPost } from "@/lib/themes/themes";

/**
 * The fully-branded / IRB hard-gate (ADR-0084). Pure: a version snapshot in, the
 * gate verdict out. A study may be preregistered / published / made live ONLY
 * when every effectively-`branded` social-post block carries a researcher-
 * uploaded logo AND the study has a recorded IRB attestation. The freeze
 * mutations enforce this (PRECONDITION_FAILED); the preflight surfaces it as an
 * advisory row. We never ship trademarked logos — the mark is researcher-supplied.
 */
export type BrandingGateResult = {
  /** At least one social-post block resolves to the "branded" tier. */
  requiresAttestation: boolean;
  /** The study has a recorded, affirmative IRB attestation. */
  hasAttestation: boolean;
  /** Branded blocks missing a researcher-uploaded logo (for "Fix in Build →"). */
  missingLogo: { instanceId: string; name: string }[];
  /** True ⇒ safe to publish/run: no branded blocks, or all branded blocks satisfied. */
  ok: boolean;
};

const nameOf = (b: BlockInstance): string =>
  (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name;

export function evaluateBrandingGate(snapshot: unknown): BrandingGateResult {
  const social = resolveSocialPost(readTheme(snapshot));
  const branded = readBlocks(snapshot).filter(
    (b) =>
      b.key === "social-post" &&
      effectiveBrandingTier(b.config as { brandingTier?: unknown }, social) === "branded",
  );
  const requiresAttestation = branded.length > 0;
  const hasAttestation = social.irbAttestation?.attested === true;
  const missingLogo = branded
    .filter((b) => {
      const key = (b.config as { brandLogoKey?: unknown }).brandLogoKey;
      return typeof key !== "string" || key.trim() === "";
    })
    .map((b) => ({ instanceId: b.instanceId, name: nameOf(b) }));
  const ok = !requiresAttestation || (hasAttestation && missingLogo.length === 0);
  return { requiresAttestation, hasAttestation, missingLogo, ok };
}

/** The participant-facing/researcher message when the gate blocks a freeze. */
export const BRANDING_GATE_MESSAGE =
  "This study uses a fully-branded stimulus. Add the brand logo to each branded post and confirm the IRB attestation before preregistering, publishing, or running it.";
