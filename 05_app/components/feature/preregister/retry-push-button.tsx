"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
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
      <PendingButton
        variant="secondary"
        onClick={() => mutation.mutate({ studyId })}
        pending={mutation.isPending}
        idleLabel="Retry push"
        pendingLabel="Retrying…"
        className="w-fit px-3 py-1.5"
      />
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
