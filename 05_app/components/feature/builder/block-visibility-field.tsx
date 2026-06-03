"use client";

import { api } from "@/lib/trpc/react";

/**
 * Per-block "Show only if condition" control (builder-conditions.md) — shown in
 * the Configure tab below the block's config. Gates the block to a subset of the
 * study's conditions (stored as slugs in the block's visibility; the runtime
 * enforces it). Empty selection = shown to everyone. Renders nothing when the
 * study has no conditions (nothing to gate on).
 */
export function BlockVisibilityField({
  studyId,
  instanceId,
  current,
}: {
  studyId: string;
  instanceId: string;
  current: string[];
}) {
  const utils = api.useUtils();
  const { data } = api.studies.listConditions.useQuery({ studyId });
  const setVis = api.studies.setBlockVisibility.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });

  const conditions = data ?? [];
  if (conditions.length === 0) return null;

  const selected = new Set(current);
  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setVis.mutate({ studyId, instanceId, showIfCondition: [...next] });
  };

  return (
    <fieldset className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
      <legend className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
        Show only if condition
      </legend>
      {conditions.map((c) => (
        <label
          key={c.id}
          className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
        >
          <input
            type="checkbox"
            checked={selected.has(c.slug)}
            onChange={() => toggle(c.slug)}
            className="size-4 accent-[var(--color-primary)]"
          />
          <span>{c.name}</span>
        </label>
      ))}
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {selected.size === 0
          ? "Shown to everyone."
          : `Shown only to ${selected.size} condition${selected.size === 1 ? "" : "s"}.`}
      </p>
    </fieldset>
  );
}
