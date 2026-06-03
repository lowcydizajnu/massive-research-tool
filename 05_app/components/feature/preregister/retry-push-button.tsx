"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Retry the OSF push for an existing preregistration (preregister-stage.md —
 * failed / no_credentials states). Re-pushes the same frozen version; refreshes
 * the RSC so the banner reflects the new status.
 */
export function RetryPushButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const mutation = api.studies.retryPush.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: () => setError("Couldn’t retry. Try again."),
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => mutation.mutate({ studyId })}
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
      >
        {mutation.isPending ? "Retrying…" : "Retry push"}
      </button>
      {error ? (
        <p
          role="alert"
          className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
