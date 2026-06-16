import { ParticipantsSubNav } from "@/components/feature/participants/participants-subnav";

/**
 * Participants destination shell (V1.15 / participants-destination.md). Sub-nav
 * strip + the active sub-view as a child route. Workspace chrome comes from the
 * parent (app)/(workspace) layout.
 */
export const dynamic = "force-dynamic";

export default function ParticipantsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Participants
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Recruit and manage participants across your studies.
        </p>
      </div>
      <ParticipantsSubNav />
      {children}
    </main>
  );
}
