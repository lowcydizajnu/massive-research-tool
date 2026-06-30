import { readConsent } from "@/server/modules/consent";
import {
  alignBlocksForDiff,
  blockDisplay,
  readBlocks,
  readGroups,
  readOverview,
  summarizeConfigDiff,
  type BlockInstance,
} from "@/server/modules/blocks";

/**
 * Auto-changelog (ADR-0033, GitHub-backlog item 3 — "release notes"): a
 * researcher-readable summary of what changed between two definition
 * snapshots. Pure + derived on read — the snapshots stay the only source of
 * truth, so generator improvements retroactively improve every history.
 * Symbols: ＋ added · － removed · ～ changed.
 */
const displayName = (b: BlockInstance): string =>
  (typeof b.title === "string" && b.title.trim()) || blockDisplay(b).name;

function readTheme(snapshot: unknown): Record<string, unknown> | null {
  if (snapshot && typeof snapshot === "object" && "theme" in snapshot) {
    const t = (snapshot as { theme?: unknown }).theme;
    if (t && typeof t === "object") return t as Record<string, unknown>;
  }
  return null;
}

export function changelogBetween(prevSnapshot: unknown, nextSnapshot: unknown): string[] {
  const out: string[] = [];
  const prevBlocks = readBlocks(prevSnapshot);
  const nextBlocks = readBlocks(nextSnapshot);

  // Align by instanceId (same-study versions preserve ids); content-alignment
  // kicks in only for histories that crossed a fork boundary.
  const { aligned } = alignBlocksForDiff(prevBlocks, nextBlocks);
  const prevById = new Map(prevBlocks.map((b) => [b.instanceId, b]));
  const nextById = new Map(aligned.map((b) => [b.instanceId, b]));

  for (const b of aligned) {
    if (!prevById.has(b.instanceId)) out.push(`＋ Added "${displayName(b)}"`);
  }
  for (const b of prevBlocks) {
    if (!nextById.has(b.instanceId)) out.push(`－ Removed "${displayName(b)}"`);
  }
  for (const b of aligned) {
    const prev = prevById.get(b.instanceId);
    if (!prev) continue;
    const lines = summarizeConfigDiff(prev, b);
    if (lines.length) {
      const shown = lines.slice(0, 3).join(" · ");
      out.push(`～ "${displayName(b)}": ${shown}${lines.length > 3 ? ` (+${lines.length - 3} more)` : ""}`);
    }
    const pg = prev.groupId ?? null;
    const ng = b.groupId ?? null;
    if (pg !== ng) {
      out.push(
        ng === null
          ? `～ "${displayName(b)}" moved out of its group screen`
          : `～ "${displayName(b)}" moved into a group screen`,
      );
    }
  }

  // Pure reorder (same surviving blocks, different relative order).
  const surviving = aligned.filter((b) => prevById.has(b.instanceId)).map((b) => b.instanceId);
  const prevOrder = prevBlocks.filter((b) => nextById.has(b.instanceId)).map((b) => b.instanceId);
  if (surviving.length > 1 && surviving.join("|") !== prevOrder.join("|")) {
    out.push("～ Blocks reordered");
  }

  // Groups (screen units, ADR-0028): added / removed / renamed.
  const prevGroups = new Map(readGroups(prevSnapshot).map((g) => [g.id, g]));
  const nextGroups = new Map(readGroups(nextSnapshot).map((g) => [g.id, g]));
  for (const [id, g] of nextGroups) {
    if (!prevGroups.has(id)) out.push(`＋ Group screen "${g.title || "Untitled"}"`);
    else if ((prevGroups.get(id)?.title ?? "") !== (g.title ?? ""))
      out.push(`～ Group renamed "${prevGroups.get(id)?.title || "Untitled"}" → "${g.title || "Untitled"}"`);
  }
  for (const [id, g] of prevGroups) {
    if (!nextGroups.has(id)) out.push(`－ Group screen "${g.title || "Untitled"}" dissolved`);
  }

  // Overview: abstract / hypotheses / sections (preregistration-facing).
  const po = readOverview(prevSnapshot);
  const no = readOverview(nextSnapshot);
  if (po.abstract !== no.abstract) out.push("～ Abstract updated");
  const addedH = no.hypotheses.filter((h) => !po.hypotheses.includes(h)).length;
  const removedH = po.hypotheses.filter((h) => !no.hypotheses.includes(h)).length;
  if (addedH) out.push(`＋ ${addedH} hypothesis${addedH === 1 ? "" : "es"}`);
  if (removedH) out.push(`－ ${removedH} hypothesis${removedH === 1 ? "" : "es"}`);
  if (
    !addedH &&
    !removedH &&
    JSON.stringify(po.hypotheses) !== JSON.stringify(no.hypotheses)
  ) {
    out.push("～ Hypotheses reworded");
  }
  if (JSON.stringify(po.sections) !== JSON.stringify(no.sections)) out.push("～ Overview sections updated");

  // Theme (ADR-0024): preset switch is the headline; anything else is "adjusted".
  const pt = readTheme(prevSnapshot);
  const nt = readTheme(nextSnapshot);
  if (JSON.stringify(pt) !== JSON.stringify(nt)) {
    const pk = (pt?.presetKey as string) ?? "academic";
    const nk = (nt?.presetKey as string) ?? "academic";
    out.push(pk !== nk ? `～ Design preset: ${pk} → ${nk}` : "～ Design adjusted");
  }

  // Consent screen (ADR-0035) — wording is protocol; IRB cares.
  if (JSON.stringify(readConsent(prevSnapshot)) !== JSON.stringify(readConsent(nextSnapshot))) {
    out.push("～ Consent screen updated");
  }

  return out;
}

/** The first frozen version has no predecessor — describe it instead of diffing. */
export function initialVersionSummary(snapshot: unknown): string[] {
  const n = readBlocks(snapshot).length;
  return [`Initial version — ${n} block${n === 1 ? "" : "s"}`];
}

/**
 * The canonical snapshot a brand-new blank study is created with (`{ blocks: [] }`).
 * `readTheme`/`readConsent`/`readOverview` normalize a snapshot with these keys
 * absent to the same defaults an untouched study carries, so diffing a
 * never-frozen draft against THIS baseline (ADR-0033 amendment) surfaces the
 * researcher's actual edits — added blocks, design preset, consent, overview —
 * with zero false "changed" lines for fields they never touched. Diffing against
 * `{}` would falsely flag design/consent because `readTheme({})` is null.
 */
export const DEFAULT_NEW_STUDY_SNAPSHOT = { blocks: [] } as const;
