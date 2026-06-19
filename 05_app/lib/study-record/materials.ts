import { mediaKindForField, type UploadKind } from "@/lib/uploads";

/**
 * Extract a study's **materials** (researcher-uploaded stimuli) from a frozen
 * version's blocks (ADR-0056 / E3). Scans each block's config for media-bearing
 * fields via `mediaKindForField` — image/video `url` + the image-interaction
 * blocks' `imageUrl`. These are `ws/` (workspace) assets, public-safe per
 * ADR-0041; participant uploads (`resp/`) never appear here. Pure → testable.
 */
export type Material = { label: string; url: string; kind: UploadKind };

type Blockish = { key: string; config?: Record<string, unknown> | null };

const humanize = (key: string): string => key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function extractMaterials(blocks: Blockish[]): Material[] {
  const out: Material[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const cfg = b.config ?? {};
    for (const [k, v] of Object.entries(cfg)) {
      const kind = mediaKindForField(b.key, k);
      if (kind && typeof v === "string" && v.trim() && !seen.has(v)) {
        seen.add(v);
        out.push({ label: humanize(b.key), url: v, kind });
      }
    }
  }
  return out;
}
