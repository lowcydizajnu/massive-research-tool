import { ParticipantsSubNav } from "@/components/feature/participants/participants-subnav";

/**
 * Participants destination shell (V1.15 / participants-destination.md). Sub-nav
 * strip + the active sub-view as a child route. Workspace chrome comes from the
 * parent (app)/(workspace) layout.
 */
export const dynamic = "force-dynamic";

export default function ParticipantsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Participants
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Recruit and manage participants across your studies.
        </p>
      </div>
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <ParticipantsSubNav />
        {children}
      </div>
    </main>
  );
}
