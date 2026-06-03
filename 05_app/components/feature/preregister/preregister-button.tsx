"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <button
        type="button"
        onClick={() => mutation.mutate({ studyId })}
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className="w-fit rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {mutation.isPending ? "Preregistering…" : "Preregister"}
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
