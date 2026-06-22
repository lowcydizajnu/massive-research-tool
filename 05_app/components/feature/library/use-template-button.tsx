"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Use template" CTA for the template detail page (ADR-0063). Forks the frozen
 * version into the active workspace and lands the researcher in the new Builder.
 */
export function UseTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const use = api.templates.useTemplate.useMutation({
    onSuccess: (res) => router.push(`/studies/${res.id}/build` as Route),
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <PendingButton
        pending={use.isPending}
        idleLabel="Use template"
        pendingLabel="Creating study…"
        onClick={() => use.mutate({ templateId })}
      />
      {use.error ? (
        <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn&rsquo;t use this template. Try again.
        </span>
      ) : null}
    </div>
  );
}
