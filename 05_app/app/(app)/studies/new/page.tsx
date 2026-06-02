import Link from "next/link";

/**
 * Placeholder for the New study flow (ADR-0011 MVP item 6, new-study-modal
 * wireframe). The `+ New study` CTA routes here so it isn't a dead button; the
 * Framework / Template / Blank picker replaces this next.
 */
export default function NewStudyPage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        New study
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        The Framework / Template / Blank picker lands next. For now, head back to
        your studies.
      </p>
      <Link
        href="/studies"
        className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
      >
        Back to Studies
      </Link>
    </div>
  );
}
