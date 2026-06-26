import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, previewToken } from "@/server/db/schema";
import { readBlocks, readGroups, type BlockInstance } from "@/server/modules/blocks";
import { deriveScreens } from "@/lib/whiteboard/screens";
import { readTheme, resolveChat, type ChatAppearance } from "@/lib/themes/themes";
import { readBlockCopy, type BlockCopyKey } from "@/lib/take/ui-copy";
import type { RuntimeBlock } from "@/server/runtime/participant";

const toRuntime = (b: BlockInstance): RuntimeBlock => ({
  instanceId: b.instanceId,
  source: b.source,
  key: b.key,
  version: b.version,
  config: b.config,
  visibility: b.visibility,
});

/** A fresh URL-safe preview token (the plaintext; shown once, never stored). */
export function newPreviewToken(): string {
  return randomBytes(24).toString("base64url"); // ~32 chars
}

/** SHA-256 hex of a token — what we persist + look up by. */
export function hashPreviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PreviewPayload = {
  title: string;
  blocks: RuntimeBlock[];
  /** The participant screen model (groups + lone blocks, ADR-0028) for paginated
   *  preview. No condition filtering — preview has no answers, so all screens show. */
  screens: RuntimeBlock[][];
  chat: ChatAppearance;
  /** Set block-internal copy overrides (social-post labels); blank = native (ADR-0070). */
  blockCopy: Partial<Record<BlockCopyKey, string>>;
};

/**
 * Resolve a public preview link (V1.12 I). Given a study id + plaintext token,
 * returns the study's working-tip title + blocks **iff** a matching token row
 * exists that is not revoked and not expired. No auth — the token IS the
 * authorization. Returns null on any miss (invalid / expired / revoked / wrong
 * study), so the route can show a single neutral "link not valid" page.
 */
export async function loadPreviewByToken(
  studyId: string,
  token: string,
): Promise<PreviewPayload | null> {
  if (!token) return null;
  const hash = hashPreviewToken(token);
  const [row] = await db
    .select({ title: experiment.title, snapshot: experimentVersion.definitionSnapshot })
    .from(previewToken)
    .innerJoin(experiment, eq(experiment.id, previewToken.experimentId))
    .innerJoin(experimentVersion, eq(experimentVersion.id, experiment.currentVersionId))
    .where(
      and(
        eq(previewToken.tokenHash, hash),
        eq(previewToken.experimentId, studyId),
        isNull(previewToken.revokedAt),
        gt(previewToken.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;

  const raw = readBlocks(row.snapshot);
  const blocks: RuntimeBlock[] = raw.map(toRuntime);
  const screens = deriveScreens(raw, readGroups(row.snapshot)).map((s) => s.blocks.map(toRuntime));
  return {
    title: row.title,
    blocks,
    screens,
    chat: resolveChat(readTheme(row.snapshot)),
    blockCopy: readBlockCopy((row.snapshot as { uiCopy?: unknown } | null)?.uiCopy),
  };
}
