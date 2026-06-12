"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Two-way OSF sync (ADR-0005 am. 3): once a registration is submitted, OSF
 * mints the DOI only after the researcher approves it THERE — this button
 * pulls the approval state + DOI back into the app.
 */
export function RefreshOsfStatus({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const refresh = api.studies.refreshRegistration.useMutation({
    onSuccess: (status) => {
      if (status.doi) {
        setNote(`Approved — DOI ${status.doi}`);
        router.refresh();
      } else if (status.withdrawn) {
        setNote("This registration was withdrawn on OSF.");
      } else if (status.pendingApproval) {
        setNote("Still awaiting your approval on OSF.");
      } else {
        setNote("No DOI yet — OSF mints it shortly after approval.");
      }
    },
    onError: (e) => setNote(e.message),
  });
  return (
    <span className="flex items-center gap-2">
      <PendingButton
        variant="secondary"
        onClick={() => refresh.mutate({ studyId })}
        pending={refresh.isPending}
        idleLabel="Check OSF status"
        pendingLabel="Checking…"
        className="px-3 py-1.5 text-[length:var(--text-small)]"
      />
      {note ? (
        <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {note}
        </span>
      ) : null}
    </span>
  );
}
