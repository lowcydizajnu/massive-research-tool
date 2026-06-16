/**
 * Placeholder for Participants sub-views that ship later in V1.15 (Open
 * recruitment / Panels / Compensation / Quality). Keeps the sub-nav honest —
 * the tab routes resolve instead of 404-ing — until each stream lands.
 */
export function ParticipantsComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{blurb}</p>
      <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-canvas)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
        Shipping in V1.15
      </span>
    </section>
  );
}
