import { and, desc, eq, gte, ne } from "drizzle-orm";

import { db } from "@/server/db/client";
import { studyPresence, user } from "@/server/db/schema";
import type { PresenceEntry, RealtimeAdapter } from "@/server/adapters/realtime";

/**
 * V1 RealtimeAdapter (ADR-0060): presence backed by the `study_presence` table +
 * client polling — no vendor to provision (mirrors the rate-limit adapter's
 * frugal default). Heartbeats upsert one row per (study, user); `listPresence`
 * returns rows touched within `staleMs` so departed collaborators fall off
 * without an explicit leave. Liveblocks/Yjs can replace this behind the seam.
 */
const DEFAULT_STALE_MS = 15_000;

export const localRealtimeAdapter: RealtimeAdapter = {
  async heartbeat({ studyId, userId, blockId }) {
    await db
      .insert(studyPresence)
      .values({ studyId, userId, blockId: blockId ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [studyPresence.studyId, studyPresence.userId],
        set: { blockId: blockId ?? null, updatedAt: new Date() },
      });
  },

  async listPresence({ studyId, exceptUserId, staleMs = DEFAULT_STALE_MS }): Promise<PresenceEntry[]> {
    const cutoff = new Date(Date.now() - staleMs);
    const rows = await db
      .select({
        userId: studyPresence.userId,
        displayName: user.displayName,
        blockId: studyPresence.blockId,
        updatedAt: studyPresence.updatedAt,
      })
      .from(studyPresence)
      .innerJoin(user, eq(studyPresence.userId, user.id))
      .where(
        and(
          eq(studyPresence.studyId, studyId),
          gte(studyPresence.updatedAt, cutoff),
          exceptUserId ? ne(studyPresence.userId, exceptUserId) : undefined,
        ),
      )
      .orderBy(desc(studyPresence.updatedAt));
    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName ?? "",
      blockId: r.blockId,
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async clear({ studyId, userId }) {
    await db
      .delete(studyPresence)
      .where(and(eq(studyPresence.studyId, studyId), eq(studyPresence.userId, userId)));
  },
};
