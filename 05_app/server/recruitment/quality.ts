/**
 * Quality-flag detection (V1.15 P5 / ADR-0049). A heuristic pass over OUR own
 * response data (the provider exposes no quality signal). Idempotent: auto flags
 * are unique on (response, kind) and inserted with onConflictDoNothing, so a
 * re-scan never duplicates and never resurrects a resolved flag.
 *
 * V1 rules (low false-positive): suspiciously-fast completion, straight-lining,
 * duplicate participant. Slow / spam-text / attention-check are deferred (ADR-0049).
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  providerSubmission,
  qualityFlag,
  response,
  responseItem,
} from "@/server/db/schema";

type FlagSeed = {
  responseId: string;
  experimentId: string;
  externalPid: string | null;
  flagKind: "fast_completion" | "straight_lining" | "duplicate_pid";
  severity: "low" | "medium" | "high";
  detail: string;
};

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Scan completed responses for a workspace (optionally one study) and insert any
 * new auto flags. Returns how many flags were newly created.
 */
export async function detectFlags(workspaceId: string, experimentId?: string): Promise<{ created: number }> {
  const rows = await db
    .select({
      responseId: response.id,
      experimentId: experiment.id,
      externalPid: response.externalPid,
      recruitmentSessionId: response.recruitmentSessionId,
      startedAt: response.startedAt,
      completedAt: response.completedAt,
    })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(
      and(
        eq(experiment.tenantId, workspaceId),
        eq(response.status, "completed"),
        isNotNull(response.completedAt),
        ...(experimentId ? [eq(experiment.id, experimentId)] : []),
      ),
    );
  if (rows.length === 0) return { created: 0 };

  const seeds: FlagSeed[] = [];

  // Group by experiment for per-study medians + duplicate detection.
  const byExp = new Map<string, typeof rows>();
  for (const r of rows) byExp.set(r.experimentId, [...(byExp.get(r.experimentId) ?? []), r]);

  for (const [expId, list] of byExp) {
    // Fast completion: < 40% of the study median (need >= 5 for a stable median).
    const durations = list.map((r) => (r.completedAt!.getTime() - r.startedAt.getTime()) / 1000).filter((d) => d > 0);
    if (durations.length >= 5) {
      const med = median(durations);
      for (const r of list) {
        const d = (r.completedAt!.getTime() - r.startedAt.getTime()) / 1000;
        if (d > 0 && d < med * 0.4) {
          seeds.push({
            responseId: r.responseId,
            experimentId: expId,
            externalPid: r.externalPid,
            flagKind: "fast_completion",
            severity: "medium",
            detail: `Completed in ${Math.round(d)}s vs study median ${Math.round(med)}s.`,
          });
        }
      }
    }

    // Duplicate participant: same external_pid completed the study more than once.
    const byPid = new Map<string, typeof list>();
    for (const r of list) {
      if (!r.externalPid) continue;
      byPid.set(r.externalPid, [...(byPid.get(r.externalPid) ?? []), r]);
    }
    for (const [pid, dupes] of byPid) {
      if (dupes.length > 1) {
        for (const r of dupes) {
          seeds.push({
            responseId: r.responseId,
            experimentId: expId,
            externalPid: pid,
            flagKind: "duplicate_pid",
            severity: "high",
            detail: `This participant completed the study ${dupes.length} times.`,
          });
        }
      }
    }
  }

  // Straight-lining: a response whose scalar answers (>=3) are all identical.
  const items = await db
    .select({ responseId: responseItem.responseId, answer: responseItem.answer })
    .from(responseItem)
    .where(inArray(responseItem.responseId, rows.map((r) => r.responseId)));
  const valuesByResponse = new Map<string, Array<string | number>>();
  for (const it of items) {
    const v = (it.answer as { value?: unknown } | null)?.value;
    if (typeof v === "string" || typeof v === "number") {
      valuesByResponse.set(it.responseId, [...(valuesByResponse.get(it.responseId) ?? []), v]);
    }
  }
  const rowById = new Map(rows.map((r) => [r.responseId, r]));
  for (const [responseId, values] of valuesByResponse) {
    if (values.length >= 3 && new Set(values.map(String)).size === 1) {
      const r = rowById.get(responseId)!;
      seeds.push({
        responseId,
        experimentId: r.experimentId,
        externalPid: r.externalPid,
        flagKind: "straight_lining",
        severity: "medium",
        detail: `Gave the same answer to all ${values.length} scale/choice items.`,
      });
    }
  }

  if (seeds.length === 0) return { created: 0 };

  // Best-effort link to the provider submission (same session + pid), for the payment decision later.
  const subs = await db
    .select({ id: providerSubmission.id, recruitmentSessionId: providerSubmission.recruitmentSessionId, externalPid: providerSubmission.externalPid })
    .from(providerSubmission)
    .where(eq(providerSubmission.workspaceId, workspaceId));
  const subByKey = new Map(subs.filter((s) => s.recruitmentSessionId).map((s) => [`${s.recruitmentSessionId}|${s.externalPid}`, s.id]));
  const sessionByResponse = new Map(rows.map((r) => [r.responseId, r.recruitmentSessionId]));

  let created = 0;
  for (const seed of seeds) {
    const sessionId = sessionByResponse.get(seed.responseId);
    const providerSubmissionId = sessionId && seed.externalPid ? (subByKey.get(`${sessionId}|${seed.externalPid}`) ?? null) : null;
    const inserted = await db
      .insert(qualityFlag)
      .values({
        id: ulid(),
        workspaceId,
        experimentId: seed.experimentId,
        responseId: seed.responseId,
        providerSubmissionId,
        externalPid: seed.externalPid,
        flagKind: seed.flagKind,
        severity: seed.severity,
        autoDetected: true,
        detail: seed.detail,
      })
      .onConflictDoNothing()
      .returning({ id: qualityFlag.id });
    if (inserted.length) created += 1;
  }
  return { created };
}
