"use client";

import type { ScreenOption } from "@/components/feature/builder/configure-form";

/**
 * CTA "go to a screen" picker for the notification / modal blocks (owner
 * 2026-07-06). A raw "screen #" number is ambiguous — the researcher can't tell
 * which screen is #3. This shows the study's screens by NAME (position + the
 * block/group content), storing the 1-based screen index the runtime already
 * uses. Falls back to a number input when no screen list is available.
 */
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const labelCls = "text-[length:var(--text-small)] text-[var(--color-text-secondary)]";

export function ScreenTargetPicker({
  value,
  onChange,
  screens,
}: {
  value: number;
  onChange: (index: number) => void;
  screens?: ScreenOption[];
}) {
  if (!screens || screens.length === 0) {
    return (
      <label className={`flex items-center gap-2 ${labelCls}`}>
        Go to screen #
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          className={`${fieldCls} w-20 py-1`}
        />
      </label>
    );
  }
  // The stored index may point past the current screens (blocks removed since) —
  // keep it selectable so the researcher can see + fix it rather than lose it.
  const known = screens.some((s) => s.index === value);
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Go to which screen?</span>
      <select
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className={`${fieldCls} w-full min-w-0`}
      >
        {screens.map((s) => (
          <option key={s.index} value={s.index}>
            Screen {s.index} — {s.label}
          </option>
        ))}
        {!known ? (
          <option value={value}>Screen {value} — (no longer in this study)</option>
        ) : null}
      </select>
    </label>
  );
}
