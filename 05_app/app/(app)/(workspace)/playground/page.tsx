import { PlaygroundBoard } from "@/components/feature/playground/playground-board";

/**
 * Playground destination — `/playground` (workspace-playground.md, ADR-0059).
 * A shared board of typed cards (link / note / image / file / reference) for the
 * material of a study-not-yet-built, with comments on every card and a
 * "Start a study from this" conversion. Workspace-scoped; all reads/writes go
 * through the `playground` router (workspace/writeProcedure). The board itself is
 * an interactive client island (optimistic add/reorder + comment threads).
 */
export const dynamic = "force-dynamic";

export default function PlaygroundPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Playground
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Collect inspiration before you build — drop in a link, a question, an image, or a paper,
          then turn the keepers into a study.
        </p>
      </header>
      <PlaygroundBoard />
    </main>
  );
}
