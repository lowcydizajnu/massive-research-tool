"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Conditions section (builder-conditions.md) — shown in the Builder right-panel
 * Details tab. Define the study's experimental conditions (name + slug +
 * allocation weight); the participant runtime assigns by weighted random and
 * honours per-block visibility. A study with none runs as a single Control group.
 */
export function ConditionsSection({ studyId }: { studyId: string }) {
  const utils = api.useUtils();
  const { data } = api.studies.listConditions.useQuery({ studyId });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void utils.studies.listConditions.invalidate({ studyId });
    void utils.studies.get.invalidate({ id: studyId }); // removal strips block visibility
  };
  const onError = (e: unknown) =>
    setError((e as { message?: string })?.message ?? "Couldn’t save the condition.");
  const onOk = () => {
    setError(null);
    invalidate();
  };
  const add = api.studies.addCondition.useMutation({ onSuccess: onOk, onError });
  const update = api.studies.updateCondition.useMutation({ onSuccess: onOk, onError });
  const remove = api.studies.removeCondition.useMutation({ onSuccess: onOk, onError });

  const list = data ?? [];
  const totalWeight = list.reduce((a, c) => a + (c.allocationWeight || 0), 0);
  const inputCls =
    "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)]";

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
        Conditions
      </h2>

      {list.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No conditions yet — this study runs as a single Control group. Add a condition to compare
          groups.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((c) => {
            const pct = totalWeight > 0 ? Math.round((c.allocationWeight / totalWeight) * 100) : 0;
            return (
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
                      if (v && v !== c.name) update.mutate({ studyId, conditionId: c.id, name: v });
                    }}
                    className={`min-w-0 flex-1 ${inputCls}`}
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
                <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  <input
                    aria-label="Condition slug"
                    key={`${c.id}-slug-${c.slug}`}
                    defaultValue={c.slug}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.slug) update.mutate({ studyId, conditionId: c.id, slug: v });
                    }}
                    className={`w-[110px] font-mono ${inputCls}`}
                  />
                  <input
                    aria-label="Allocation weight"
                    type="number"
                    min={0}
                    step="0.5"
                    key={`${c.id}-w-${c.allocationWeight}`}
                    defaultValue={c.allocationWeight}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== c.allocationWeight)
                        update.mutate({ studyId, conditionId: c.id, allocationWeight: v });
                    }}
                    className={`w-[64px] ${inputCls}`}
                  />
                  <span aria-hidden>≈{pct}%</span>
                </div>
              </li>
            );
          })}
        </ul>
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
          All weights are 0 — assignment falls back to the first condition.
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
