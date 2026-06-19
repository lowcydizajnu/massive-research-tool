"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Save / bookmark a study to your reading list (ADR-0056) — distinct from
 * Follow. Optimistic toggle; surfaced back on the personal dashboard. Shown in
 * the public record sidebar.
 */
export function SaveButton({ studyId, className }: { studyId: string; className?: string }) {
  const utils = api.useUtils();
  const saved = api.saved.isSaved.useQuery({ studyId });
  const toggle = api.saved.toggle.useMutation({
    onSuccess: ({ saved: next }) => {
      utils.saved.isSaved.setData({ studyId }, next);
      void utils.saved.list.invalidate();
    },
  });
  const isSaved = saved.data ?? false;

  return (
    <button
      type="button"
      onClick={() => toggle.mutate({ studyId })}
      disabled={toggle.isPending || saved.isLoading}
      aria-pressed={isSaved}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-2 text-[length:var(--text-small)] font-medium disabled:opacity-60",
        isSaved
          ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
          : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
        className,
      )}
    >
      {isSaved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      {isSaved ? "Saved" : "Save"}
    </button>
  );
}
