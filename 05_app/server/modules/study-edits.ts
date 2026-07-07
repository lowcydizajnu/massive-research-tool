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
/** Cap the field-detail list so a wholesale config replace can't bloat a row. */
const MAX_DETAIL = 15;

/**
 * Humanize a config key for the changelog detail (ADR-0086 am.): split camelCase
 * + underscores/dashes into words and sentence-case it. `captureUsername` →
 * "Capture username", `brand_name` → "Brand name". Not curated per-module — cheap
 * and maintenance-free; good enough for an advisory "which fields changed" list.
 */
export function humanizeFieldKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : key;
}

/** Keys whose value changed between two config objects (deep-equal via JSON). */
export function changedConfigKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) changed.push(k);
  }
  return changed;
}

/** The humanized field-detail for a block-config edit (deduped, capped). */
export function blockEditDetail(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return changedConfigKeys(before, after).map(humanizeFieldKey).slice(0, MAX_DETAIL);
}

/** Union two detail lists (existing wins order), deduped + capped — used when a
 *  new edit coalesces into a recent row so all touched fields accumulate. Pure. */
export function mergeDetail(existing: string[], incoming: string[]): string[] {
  const out: string[] = [];
  for (const d of [...(existing ?? []), ...(incoming ?? [])]) {
    if (d && !out.includes(d)) out.push(d);
    if (out.length >= MAX_DETAIL) break;
  }
  return out;
}

/**
 * Record one edit. Coalesces with the most recent same-(study, actor, kind) row
 * when it is < 2 min old (updates its summary + timestamp, and UNIONS the field
 * detail) so autosave-driven edits don't flood the trail; otherwise appends.
 * Advisory + best-effort: any failure is swallowed so a logging hiccup never
 * breaks the actual save. `detail` (ADR-0086 am.) is the humanized list of fields
 * this edit touched — empty for kinds that don't compute one.
 */
export async function recordStudyEdit(
  experimentId: string,
  actorUserId: string | null,
  kind: StudyEditKind,
  summary: string,
  detail: string[] = [],
): Promise<void> {
  try {
    const [recent] = await db
      .select({ id: studyEditEvent.id, createdAt: studyEditEvent.createdAt, detail: studyEditEvent.detail })
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
      await db
        .update(studyEditEvent)
        .set({ summary, detail: mergeDetail(recent.detail ?? [], detail), createdAt: now })
        .where(eq(studyEditEvent.id, recent.id));
      return;
    }
    await db.insert(studyEditEvent).values({ id: ulid(), experimentId, actorUserId, kind, summary, detail });
  } catch {
    /* advisory log — never block a save on a trail-write failure */
  }
}
