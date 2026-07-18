"use client";

import { Plus, Scale, Shuffle, X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { blockSizeFor } from "@/lib/conditions/assignment";
import { api } from "@/lib/trpc/react";

/**
 * Conditions section (builder-conditions.md, ADR-0109) — Builder right-panel
 * Details tab. Defines the study's arms and, above them, two plain-language
 * controls: how the groups are SIZED (Equal / Custom %) and how participants are
 * RANDOMIZED into them (Simple / Balanced). The old raw allocation-weight number
 * is gone; splits read as percentages and the method is a named choice, not an
 * unspoken default. A study with no conditions runs as a single Control group.
 */

type Row = { id: string; name: string; slug: string; allocationWeight: number; position: number };

/** All arms weighted the same ⇒ an equal split (ADR-0109 D1 — the mode is derived
 *  from the weights, never a separate stored flag). */
function allEqual(rows: Row[]): boolean {
  if (rows.length < 2) return true;
  return rows.every((r) => r.allocationWeight === rows[0].allocationWeight);
}

const fieldCls =
  "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const selectCls = `${fieldCls} cursor-pointer`;

export function ConditionsSection({ studyId }: { studyId: string }) {
  const utils = api.useUtils();
  const { data } = api.studies.listConditions.useQuery({ studyId });
  const study = api.studies.get.useQuery({ id: studyId });
  const [error, setError] = useState<string | null>(null);
  // Explicit split-mode override so choosing "Custom" stays Custom even if the
  // researcher happens to type an even split — otherwise the % inputs would flip
  // away mid-edit. Null = derive from the weights.
  const [splitOverride, setSplitOverride] = useState<"equal" | "custom" | null>(null);

  const invalidate = () => {
    void utils.studies.listConditions.invalidate({ studyId });
    void utils.studies.get.invalidate({ id: studyId }); // removal strips block visibility + carries the method
  };
  const onError = (e: unknown) => setError((e as { message?: string })?.message ?? "Couldn’t save.");
  const onOk = () => {
    setError(null);
    invalidate();
  };
  const add = api.studies.addCondition.useMutation({ onSuccess: onOk, onError });
  const update = api.studies.updateCondition.useMutation({ onError });
  const remove = api.studies.removeCondition.useMutation({
    // removeCondition returns {ok:false, reason} (not a throw) when the group has
    // responses, so a legitimate refusal shows here and never trips autosave.
    onSuccess: (res) => {
      if (res.ok) onOk();
      else setError(res.reason ?? "Couldn’t remove this group.");
    },
    onError,
  });
  const setMethod = api.studies.setConditionAssignment.useMutation({ onSuccess: onOk, onError });

  const list: Row[] = data ?? [];
  const totalWeight = list.reduce((a, c) => a + (c.allocationWeight || 0), 0);
  const split = splitOverride ?? (allEqual(list) ? "equal" : "custom");
  const method = study.data?.conditionAssignment ?? "simple";
  const pct = (w: number) => (totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0);
  const customTotal = list.reduce((a, c) => a + (c.allocationWeight || 0), 0);

  /** Persist weight changes for several rows, then refresh once. */
  const bulkSetWeights = async (next: { id: string; weight: number }[]) => {
    setError(null);
    try {
      await Promise.all(
        next.map((n) => update.mutateAsync({ studyId, conditionId: n.id, allocationWeight: n.weight })),
      );
    } catch (e) {
      onError(e);
    }
    invalidate();
  };

  /** Switch the split mode — Equal levels every weight; Custom turns the current
   *  shares into editable percentages that sum to ~100 (ADR-0109 D1). */
  const onSplitChange = (next: "equal" | "custom") => {
    setSplitOverride(next);
    if (next === "equal") {
      const changed = list.filter((c) => c.allocationWeight !== 1).map((c) => ({ id: c.id, weight: 1 }));
      if (changed.length) void bulkSetWeights(changed);
    } else {
      // Normalise to percentages so each row's number reads as its share.
      const asPct = list.map((c) => ({ id: c.id, weight: pct(c.allocationWeight) }));
      if (asPct.some((n, i) => n.weight !== list[i].allocationWeight)) void bulkSetWeights(asPct);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Conditions</h2>

      {data === undefined ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No conditions yet — this study runs as a single Control group. Add a condition to compare groups.
        </p>
      ) : (
        <>
          {/* Assignment controls (ADR-0109) — sizing + randomization, in plain terms. */}
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-3">
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                Group sizes
              </span>
              <select
                aria-label="Group sizes"
                value={split}
                onChange={(e) => onSplitChange(e.target.value as "equal" | "custom")}
                className={selectCls}
              >
                <option value="equal">Equal — every group the same size</option>
                <option value="custom">Custom — set each group’s share</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                {method === "balanced" ? <Scale className="size-3.5" aria-hidden /> : <Shuffle className="size-3.5" aria-hidden />}
                Randomization
              </span>
              <select
                aria-label="Randomization method"
                value={method}
                disabled={setMethod.isPending}
                onChange={(e) => setMethod.mutate({ studyId, method: e.target.value as "simple" | "balanced" })}
                className={selectCls}
              >
                <option value="simple">Simple random</option>
                <option value="balanced">Balanced</option>
              </select>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {method === "balanced"
                  ? `Keeps groups even as participants arrive — evens out every ${blockSizeFor(list.map((c) => c.allocationWeight)) || list.length} participants.`
                  : "Each participant is assigned independently. Groups can come out uneven, especially with few participants."}
              </span>
            </label>
          </div>

          {/* Condition rows. */}
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2"
              >
                <div className="flex items-center gap-1">
                  <input
                    aria-label="Condition name"
                    key={`${c.id}-name-${c.name}`}
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name) update.mutate({ studyId, conditionId: c.id, name: v }, { onSuccess: onOk, onError });
                    }}
                    className={`min-w-0 flex-1 ${fieldCls}`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => remove.mutate({ studyId, conditionId: c.id })}
                    className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  <input
                    aria-label="Condition slug"
                    key={`${c.id}-slug-${c.slug}`}
                    defaultValue={c.slug}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.slug) update.mutate({ studyId, conditionId: c.id, slug: v }, { onSuccess: onOk, onError });
                    }}
                    className={`w-[110px] font-mono ${fieldCls}`}
                  />
                  {split === "custom" ? (
                    <span className="flex items-center gap-1">
                      <input
                        aria-label={`${c.name} share (percent)`}
                        type="number"
                        min={0}
                        max={100}
                        key={`${c.id}-pct-${c.allocationWeight}`}
                        defaultValue={pct(c.allocationWeight)}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.round(Number(e.target.value)));
                          if (!Number.isNaN(v) && v !== c.allocationWeight)
                            update.mutate({ studyId, conditionId: c.id, allocationWeight: v }, { onSuccess: onOk, onError });
                        }}
                        className={`w-[56px] ${fieldCls}`}
                      />
                      <span aria-hidden>%</span>
                    </span>
                  ) : (
                    <span aria-label={`${c.name} share`}>≈{pct(c.allocationWeight)}%</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Live total for custom splits — a gentle nudge, never a hard block. */}
          {split === "custom" ? (
            <p
              className={
                "text-[length:var(--text-small)] " +
                (customTotal === 100
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-warning-text-on-subtle)]")
              }
            >
              Total: {customTotal}%{customTotal === 100 ? "" : " — shares should add up to 100%."}
            </p>
          ) : null}
        </>
      )}

      <PendingButton
        variant="secondary"
        onClick={() => add.mutate({ studyId, name: `Condition ${list.length + 1}` })}
        pending={add.isPending}
        idleLabel={
          <>
            <Plus className="size-3.5" aria-hidden />
            Add condition
          </>
        }
        pendingLabel="Adding…"
        className="self-start px-2.5 py-1 text-[length:var(--text-small)]"
      />

      {list.length > 0 && totalWeight === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          Every group is set to 0% — assignment falls back to the first condition. Give at least one group a share.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
