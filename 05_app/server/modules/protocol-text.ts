import { blockDisplay, readBlocks, readGroups, readOverview } from "./blocks";

/**
 * Canonical researcher-readable serialization of a definition_snapshot
 * (ADR-0031) — the input to the GitHub-style text diff. Deterministic, one
 * property per line, list items one per line (minimal diff churn), protocol-
 * sheet language (never raw JSON keys). Tests pin the format.
 */

const humanize = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const scalar = (v: unknown): string =>
  typeof v === "boolean" ? (v ? "yes" : "no") : String(v);

type AnyField = { key?: string; label?: string; type?: string; required?: boolean; options?: string[] };

/** One block's config as indented lines (field-group fields + string lists get a line each). */
function configLines(config: Record<string, unknown>, indent: string): string[] {
  const out: string[] = [];
  for (const [key, v] of Object.entries(config)) {
    if (v == null || v === "") continue;
    if (key === "fields" && Array.isArray(v)) {
      for (const f of v as AnyField[]) {
        const extras = [f.type ?? "text", ...(f.required ? ["required"] : [])].join(", ");
        out.push(`${indent}Field: ${f.label ?? f.key} (${extras})`);
        for (const o of f.options ?? []) out.push(`${indent}  Choice: ${o}`);
      }
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out.push(`${indent}${humanize(key)}:`);
      for (const item of v) out.push(`${indent}  - ${scalar(item)}`);
      continue;
    }
    if (typeof v === "object") continue; // nested objects have no protocol-sheet reading
    out.push(`${indent}${humanize(key)}: ${scalar(v)}`);
  }
  return out;
}

/** Serialize a snapshot to protocol-sheet lines (Overview, then blocks/groups in order). */
export function protocolText(snapshot: unknown): string[] {
  const out: string[] = [];
  const overview = readOverview(snapshot);
  const blocks = readBlocks(snapshot);
  const groups = readGroups(snapshot);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  out.push("OVERVIEW");
  if (overview.abstract.trim()) {
    out.push("Abstract:");
    for (const line of overview.abstract.split("\n")) out.push(`  ${line}`);
  }
  overview.hypotheses.forEach((h, i) => out.push(`H${i + 1}: ${h}`));
  for (const s of overview.sections) {
    out.push(`${s.heading}:`);
    for (const line of s.contentMd.split("\n")) out.push(`  ${line}`);
  }
  if (overview.replicationNotes.trim()) {
    out.push("Replication notes:");
    for (const line of overview.replicationNotes.split("\n")) out.push(`  ${line}`);
  }

  out.push("");
  out.push("PROTOCOL");
  let lastGroup: string | undefined;
  let n = 0;
  for (const b of blocks) {
    if (b.groupId !== lastGroup) {
      lastGroup = b.groupId;
      if (b.groupId) {
        const g = groupById.get(b.groupId);
        out.push(`Screen group: ${g?.title?.trim() || "Untitled group"}`);
      }
    }
    n += 1;
    const d = blockDisplay(b);
    const indent = b.groupId ? "  " : "";
    out.push(`${indent}${n}. ${d.name}${b.title?.trim() ? ` — “${b.title.trim()}”` : ""}`);
    const arms = b.visibility?.showIfCondition ?? [];
    if (arms.length) out.push(`${indent}   Shown only for: ${arms.join(", ")}`);
    out.push(...configLines(b.config ?? {}, `${indent}   `));
  }
  return out;
}
