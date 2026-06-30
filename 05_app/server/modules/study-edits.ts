import { and, desc, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { studyEditEvent } from "@/server/db/schema";

/**
 * Study edit-event log (ADR-0086). An ADVISORY, append-only trail of researcher
 * edits to a study's working draft — the changelog "Detailed" timeline. Never
 * authoritative (snapshots + frozen versions are the source of truth), never a
 * gate, never exported. See `04_architecture/data-model/08-study-edit-event.md`.
 */
export type StudyEditKind =
  | "blocks"
  | "theme"
  | "social-post"
  | "consent"
  | "overview"
  | "conditions"
  | "variants"
  | "wording"
  | "title"
  | "irb";

/** Coalesce same-(study, actor, kind) edits made within this window into one row. */
const COALESCE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Record one edit. Coalesces with the most recent same-(study, actor, kind) row
 * when it is < 2 min old (updates its summary + timestamp) so autosave-driven
 * edits don't flood the trail; otherwise appends. Advisory + best-effort: any
 * failure is swallowed so a logging hiccup never breaks the actual save.
 */
export async function recordStudyEdit(
  experimentId: string,
  actorUserId: string | null,
  kind: StudyEditKind,
  summary: string,
): Promise<void> {
  try {
    const [recent] = await db
      .select({ id: studyEditEvent.id, createdAt: studyEditEvent.createdAt })
      .from(studyEditEvent)
      .where(
        and(
          eq(studyEditEvent.experimentId, experimentId),
          actorUserId ? eq(studyEditEvent.actorUserId, actorUserId) : isNull(studyEditEvent.actorUserId),
          eq(studyEditEvent.kind, kind),
        ),
      )
      .orderBy(desc(studyEditEvent.createdAt))
      .limit(1);

    const now = new Date();
    if (recent && now.getTime() - recent.createdAt.getTime() < COALESCE_WINDOW_MS) {
      await db.update(studyEditEvent).set({ summary, createdAt: now }).where(eq(studyEditEvent.id, recent.id));
      return;
    }
    await db.insert(studyEditEvent).values({ id: ulid(), experimentId, actorUserId, kind, summary });
  } catch {
    /* advisory log — never block a save on a trail-write failure */
  }
}
