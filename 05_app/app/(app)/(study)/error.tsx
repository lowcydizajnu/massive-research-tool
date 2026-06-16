"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for the focused study stages (Builder / Run / Preregister /
 * Preview / Results). A thrown server or client error here renders this instead
 * of the raw Next.js "Application error" digest screen — a plain explanation + a
 * way out (retry, or back to Studies). `digest` is shown small for support.
 */
export default function StudyStageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console + any client error reporting.
    console.error("Study stage error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        This page didn’t load
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        Something went wrong opening this study stage. This is on us, not you — try again, and if it
        keeps happening, let us know with the reference below.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/studies"
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          Back to Studies
        </Link>
      </div>
      {error.digest ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
