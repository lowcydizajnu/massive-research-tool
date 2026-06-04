"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Preregister action (preregister-stage.md). Calls studies.preregister, then
 * refreshes the RSC so the receipt/banner replaces the action zone. The button
 * stays available whether or not OSF is connected — preregistering always
 * freezes a citable version; the push just parks as no_credentials when
 * disconnected.
 */
export function PreregisterButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const mutation = api.studies.preregister.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: () => setError("Couldn’t preregister. Try again."),
  });

  return (
    <div className="flex flex-col gap-2">
      <PendingButton
        onClick={() => mutation.mutate({ studyId })}
        pending={mutation.isPending}
        idleLabel="Preregister"
        pendingLabel="Preregistering…"
        className="w-fit"
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
