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
export function PreregisterButton({
  studyId,
  label = "Preregister",
  variant = "primary",
}: {
  studyId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const mutation = api.studies.preregister.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: () => setError("Couldn’t preregister. Try again."),
  });

  const cls =
    variant === "primary"
      ? "bg-[var(--color-primary)] text-white hover:opacity-90"
      : "border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => mutation.mutate({ studyId })}
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className={`w-fit rounded-[var(--radius-md)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium disabled:opacity-60 ${cls}`}
      >
        {mutation.isPending ? "Preregistering…" : label}
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
