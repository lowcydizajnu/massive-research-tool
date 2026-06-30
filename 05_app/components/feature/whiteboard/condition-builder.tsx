"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import {
  OPERATOR_LABELS,
  type Clause,
  type ConditionGroup,
  type Operator,
  normalizeCondition,
  operatorsForKey,
} from "@/lib/whiteboard/conditions";
import { cn } from "@/lib/utils";
import { getModuleDef } from "@/server/modules/registry";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/** Operators whose value is a list (comma-separated); others are single text/number. */
const LIST_VALUE: Operator[] = ["isAnyOf", "includesAny"];

/**
 * Enumerable answer choices for a source block, shown by LABEL but stored by the
 * value the runtime records (so researchers never type a raw key like `r2`).
 * Returns null when the source has no fixed choice set (free-text / numeric).
 */
function valueOptionsForSource(b: StudyBlock | undefined): { value: string; label: string }[] | null {
  if (!b) return null;
  const cfg = (b.config ?? {}) as Record<string, unknown>;
  if (b.key === "hot-spot" && Array.isArray(cfg.regions)) {
    return (cfg.regions as { key?: unknown; label?: unknown }[])
      .filter((r) => typeof r.key === "string" && r.key)
      .map((r) => ({ value: String(r.key), label: typeof r.label === "string" && r.label ? String(r.label) : String(r.key) }));
  }
  if ((b.key === "multiple-choice" || b.key === "attention-check") && Array.isArray(cfg.options)) {
    return (cfg.options as unknown[]).filter((o) => o != null && o !== "").map((o) => ({ value: String(o), label: String(o) }));
  }
  return null; // free-text / numeric — keep the text/number input
}

/**
 * Type-aware AND/OR condition builder (ADR-0021 amendment). Edits the visibility
 * condition for `block` — "show this block when …" — over the answers to the
 * blocks before it. Each clause's operator menu + value input adapt to the
 * chosen source block's module type. Saving writes `setBlockCondition`.
 */
export function ConditionBuilder({
  block,
  earlierBlocks,
  pending,
  onSave,
}: {
  block: StudyBlock;
  earlierBlocks: StudyBlock[];
  pending: boolean;
  onSave: (showIf: ConditionGroup | null) => void;
}) {
  // Only blocks that record an answer can be a condition source — version-aware via
  // the registry (e.g. social-post v2 collects a comment, v1 doesn't). Stimulus /
  // display-only blocks (audio-stimulus, text, image, video, link…) are excluded so
  // they don't appear as a non-actionable dead-end (ADR-0021 amendment).
  const sources = earlierBlocks.filter((b) => {
    const def = getModuleDef(b.source, b.key, b.version);
    // A condition source must record data AND expose a branchable answer — `video`
    // records watch/exposure but isn't a meaningful branch input (conditionSource:false).
    return (def?.collectsResponse ?? false) && (def?.conditionSource ?? true);
  });
  const initial = normalizeCondition(block.showIf, block.branchRules);
  const [op, setOp] = useState<"and" | "or">(initial?.op ?? "and");
  const [clauses, setClauses] = useState<Clause[]>(initial?.clauses ?? []);

  const blockOf = (id: string) => sources.find((b) => b.instanceId === id);
  const labelOf = (b: StudyBlock) => b.title?.trim() || b.name;

  const update = (i: number, patch: Partial<Clause>) =>
    setClauses((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const addClause = () => {
    const src = sources[0];
    if (!src) return;
    const operator = operatorsForKey(src.key)[0];
    setClauses((cs) => [...cs, { fromInstanceId: src.instanceId, operator, value: [""] }]);
  };

  const save = () => {
    const clean = clauses.filter(
      (c) => c.fromInstanceId && (c.operator === "answered" || c.value.some((v) => v.trim() !== "")),
    );
    onSave(clean.length ? { op, clauses: clean } : null);
  };

  if (sources.length === 0) {
    return (
      <div className="flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-3">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Show this block when
        </span>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Add an answerable block before this one to condition it on an answer.
        </p>
      </div>
    );
  }

  const fieldCls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        Show this block when
      </span>

      {clauses.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Always shown. Add a condition to gate it on an earlier answer.
        </p>
      ) : (
        <>
          {clauses.length > 1 ? (
            <div role="radiogroup" aria-label="Combine conditions" className="flex gap-1">
              {(["and", "or"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={op === o}
                  onClick={() => setOp(o)}
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-0.5 text-[length:var(--text-small)] font-medium uppercase",
                    op === o
                      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  {o === "and" ? "All (AND)" : "Any (OR)"}
                </button>
              ))}
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {clauses.map((c, i) => {
              const src = blockOf(c.fromInstanceId);
              const ops = src ? operatorsForKey(src.key) : (["eq"] as Operator[]);
              const isList = LIST_VALUE.includes(c.operator);
              const isBetween = c.operator === "between";
              const noValue = c.operator === "answered";
              const opts = valueOptionsForSource(src); // hot-spot regions / choice options, by label
              return (
                <li key={i} className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2">
                  <div className="flex items-center gap-1">
                    <select
                      aria-label="Source block"
                      value={c.fromInstanceId}
                      onChange={(e) => {
                        const next = blockOf(e.target.value);
                        update(i, {
                          fromInstanceId: e.target.value,
                          operator: next ? operatorsForKey(next.key)[0] : c.operator,
                        });
                      }}
                      className={cn("min-w-0 flex-1", fieldCls)}
                    >
                      {sources.map((b) => (
                        <option key={b.instanceId} value={b.instanceId}>
                          {labelOf(b)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Remove condition"
                      onClick={() => setClauses((cs) => cs.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] hover:text-[var(--color-danger-text-on-subtle)]"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label="Operator"
                      value={c.operator}
                      onChange={(e) => update(i, { operator: e.target.value as Operator })}
                      className={fieldCls}
                    >
                      {ops.map((o) => (
                        <option key={o} value={o}>
                          {OPERATOR_LABELS[o]}
                        </option>
                      ))}
                    </select>
                    {noValue ? null : isBetween ? (
                      <>
                        <input
                          aria-label="Min"
                          value={c.value[0] ?? ""}
                          onChange={(e) => update(i, { value: [e.target.value, c.value[1] ?? ""] })}
                          className={cn("w-16", fieldCls)}
                        />
                        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">and</span>
                        <input
                          aria-label="Max"
                          value={c.value[1] ?? ""}
                          onChange={(e) => update(i, { value: [c.value[0] ?? "", e.target.value] })}
                          className={cn("w-16", fieldCls)}
                        />
                      </>
                    ) : opts && isList ? (
                      // multi-select source (e.g. multiple-choice "is any of") — pick by label
                      <div role="group" aria-label="Values" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {opts.map((o) => (
                          <label key={o.value} className="flex items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={c.value.includes(o.value)}
                              onChange={(e) =>
                                update(i, { value: e.target.checked ? [...c.value, o.value] : c.value.filter((v) => v !== o.value) })
                              }
                              className="accent-[var(--color-primary)]"
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ) : opts ? (
                      // fixed-choice source (hot-spot region / single choice) — pick by label, store the key
                      <select
                        aria-label="Value"
                        value={c.value[0] ?? ""}
                        onChange={(e) => update(i, { value: [e.target.value] })}
                        className={cn("min-w-0 flex-1", fieldCls)}
                      >
                        <option value="" disabled>
                          Choose…
                        </option>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label="Value"
                        placeholder={isList ? "a, b, c" : "value"}
                        value={isList ? c.value.join(", ") : (c.value[0] ?? "")}
                        onChange={(e) =>
                          update(i, {
                            value: isList
                              ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                              : [e.target.value],
                          })
                        }
                        className={cn("min-w-0 flex-1", fieldCls)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addClause}
          className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          + Add condition
        </button>
        <PendingButton
          pending={pending}
          idleLabel="Save condition"
          pendingLabel="Saving…"
          onClick={save}
          className="px-2 py-0.5 text-[length:var(--text-small)]"
        />
      </div>
    </div>
  );
}
