/**
 * Quality-flag detection (V1.15 P5 / ADR-0049, + amendment 1). A heuristic pass
 * over OUR own response data (the provider exposes no quality signal). Idempotent:
 * auto flags are unique on (response, kind) and inserted with onConflictDoNothing,
 * so a re-scan never duplicates and never resurrects a resolved flag.
 *
 * Rules (all tuned for low false-positives):
 *  - fast_completion   — < 40% of the study median (>= 5 sample)
 *  - slow_completion   — > 3x the study median (>= 5 sample); low severity (often benign)
 *  - straight_lining   — >= 3 identical scalar answers
 *  - duplicate_pid     — same external_pid completed the study more than once
 *  - attention_check   — failed an explicit attention-check block (selected != correctAnswer)
 *  - spam_text         — a free-text answer that is a URL or a single repeated character
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
import type { BlockInstance } from "@/server/modules/blocks";

type FlagKind = "fast_completion" | "slow_completion" | "straight_lining" | "duplicate_pid" | "attention_check" | "spam_text";

type FlagSeed = {
  responseId: string;
  experimentId: string;
  externalPid: string | null;
  flagKind: FlagKind;
  severity: "low" | "medium" | "high";
  detail: string;
};

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Conservative low-effort free-text signals: a pasted URL or a single char repeated. */
function spamTextReason(text: string): string | null {
  const t = text.trim();
  if (/https?:\/\/|www\./i.test(t)) return "contains a URL";
  if (t.length >= 4 && /^(.)\1+$/.test(t)) return "is a single repeated character";
  return null;
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
      experimentVersionId: response.experimentVersionId,
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
    // Timing: < 40% (fast) or > 3x (slow) of the study median (need >= 5 for stability).
    const durations = list.map((r) => (r.completedAt!.getTime() - r.startedAt.getTime()) / 1000).filter((d) => d > 0);
    if (durations.length >= 5) {
      const med = median(durations);
      for (const r of list) {
        const d = (r.completedAt!.getTime() - r.startedAt.getTime()) / 1000;
        if (d <= 0) continue;
        if (d < med * 0.4) {
          seeds.push({
            responseId: r.responseId,
            experimentId: expId,
            externalPid: r.externalPid,
            flagKind: "fast_completion",
            severity: "medium",
            detail: `Completed in ${Math.round(d)}s vs study median ${Math.round(med)}s.`,
          });
        } else if (d > med * 3) {
          seeds.push({
            responseId: r.responseId,
            experimentId: expId,
            externalPid: r.externalPid,
            flagKind: "slow_completion",
            severity: "low",
            detail: `Took ${Math.round(d)}s vs study median ${Math.round(med)}s — may have stepped away.`,
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

  // Per-item rules need the answers + the block definitions (for attention-check
  // correct answers). Load both, keyed for O(1) lookup.
  const items = await db
    .select({
      responseId: responseItem.responseId,
      blockInstanceId: responseItem.blockInstanceId,
      moduleKey: responseItem.moduleKey,
      answer: responseItem.answer,
    })
    .from(responseItem)
    .where(inArray(responseItem.responseId, rows.map((r) => r.responseId)));

  const versionIds = [...new Set(rows.map((r) => r.experimentVersionId))];
  const versions = versionIds.length
    ? await db
        .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .where(inArray(experimentVersion.id, versionIds))
    : [];
  // versionId -> (blockInstanceId -> correctAnswer) for attention-check blocks.
  const correctByVersion = new Map<string, Map<string, string>>();
  for (const v of versions) {
    const blocks = ((v.snapshot as { blocks?: BlockInstance[] })?.blocks ?? []).filter((b) => b.key === "attention-check");
    const m = new Map<string, string>();
    for (const b of blocks) {
      const correct = (b.config as { correctAnswer?: unknown }).correctAnswer;
      if (typeof correct === "string") m.set(b.instanceId, correct);
    }
    if (m.size) correctByVersion.set(v.id, m);
  }
  const rowById = new Map(rows.map((r) => [r.responseId, r]));

  const itemsByResponse = new Map<string, typeof items>();
  for (const it of items) itemsByResponse.set(it.responseId, [...(itemsByResponse.get(it.responseId) ?? []), it]);

  for (const [responseId, its] of itemsByResponse) {
    const r = rowById.get(responseId);
    if (!r) continue;

    // Straight-lining: >= 3 identical scalar answers.
    const scalars = its
      .map((it) => (it.answer as { value?: unknown } | null)?.value)
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    if (scalars.length >= 3 && new Set(scalars.map(String)).size === 1) {
      seeds.push({
        responseId,
        experimentId: r.experimentId,
        externalPid: r.externalPid,
        flagKind: "straight_lining",
        severity: "medium",
        detail: `Gave the same answer to all ${scalars.length} scale/choice items.`,
      });
    }

    // Attention check: a "selected" answer that differs from the block's correctAnswer.
    const correct = correctByVersion.get(r.experimentVersionId);
    if (correct) {
      for (const it of its) {
        if (it.moduleKey !== "attention-check") continue;
        const expected = correct.get(it.blockInstanceId);
        if (!expected) continue;
        const selected = (it.answer as { selected?: unknown } | null)?.selected;
        const got = Array.isArray(selected) ? selected.map(String) : [];
        if (got.length !== 1 || got[0] !== expected) {
          seeds.push({
            responseId,
            experimentId: r.experimentId,
            externalPid: r.externalPid,
            flagKind: "attention_check",
            severity: "high",
            detail: `Failed an attention check (answered ${got.length ? `“${got[0]}”` : "nothing"}, expected “${expected}”).`,
          });
          break; // one flag per response is enough
        }
      }
    }

    // Spam text: a free-text answer that's a URL or a single repeated character.
    for (const it of its) {
      const text = (it.answer as { text?: unknown } | null)?.text;
      if (typeof text !== "string") continue;
      const reason = spamTextReason(text);
      if (reason) {
        seeds.push({
          responseId,
          experimentId: r.experimentId,
          externalPid: r.externalPid,
          flagKind: "spam_text",
          severity: "medium",
          detail: `A free-text answer ${reason}.`,
        });
        break;
      }
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

/**
 * Background sweep (ADR-0049 am. 1): run detection for every workspace that has
 * completed responses. Bounded + idempotent (detectFlags is onConflictDoNothing),
 * so the cron + a manual Re-scan never collide. Returns totals for the job log.
 */
export async function detectFlagsAllWorkspaces(): Promise<{ workspaces: number; created: number }> {
  const wsRows = await db
    .selectDistinct({ workspaceId: experiment.tenantId })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(and(eq(response.status, "completed"), isNotNull(response.completedAt)));
  let created = 0;
  for (const { workspaceId } of wsRows) {
    const r = await detectFlags(workspaceId);
    created += r.created;
  }
  return { workspaces: wsRows.length, created };
}
