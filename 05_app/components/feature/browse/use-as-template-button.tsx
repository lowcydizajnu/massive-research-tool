"use client";

import { useRouter } from "next/navigation";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Use as template" (ADR-0038): copy a public study as a fresh starting point —
 * fresh block identities, NO lineage (vs Replicate, which preserves ids for
 * diffing and shows up in Replications).
 */
export function UseAsTemplateButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const copy = api.studies.useAsTemplate.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  return (
    <PendingButton
      variant="secondary"
      onClick={() => copy.mutate({ studyId })}
      pending={copy.isPending}
      idleLabel="Use as template"
      pendingLabel="Copying…"
    />
  );
}
