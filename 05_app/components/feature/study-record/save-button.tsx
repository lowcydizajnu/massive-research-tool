"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { signInHref } from "@/lib/auth/sign-in-redirect";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

const SAVED_INTRO_KEY = "mrt:saved-intro-seen";

/**
 * Save / bookmark a study to your reading list (ADR-0056) — distinct from
 * Follow. Optimistic toggle; surfaced on the "Saved" tab + personal dashboard.
 * The FIRST time someone saves anything, a one-time modal explains where saved
 * studies live (item 4); the flag is per-browser (localStorage).
 */
export function SaveButton({ studyId, className, authed = true }: { studyId: string; className?: string; authed?: boolean }) {
  const router = useRouter();
  const utils = api.useUtils();
  // GitHub-model (ADR-0055 am.1): skip the protected on-mount query for anon;
  // the button still renders ("Save") and a click routes to /signin.
  const saved = api.saved.isSaved.useQuery({ studyId }, { enabled: authed });
  const [intro, setIntro] = useState(false);
  const toggle = api.saved.toggle.useMutation({
    onSuccess: ({ saved: next }) => {
      utils.saved.isSaved.setData({ studyId }, next);
      void utils.saved.list.invalidate();
      // Explain where saves go — once, on the first-ever save.
      if (next && typeof window !== "undefined" && !window.localStorage.getItem(SAVED_INTRO_KEY)) {
        window.localStorage.setItem(SAVED_INTRO_KEY, "1");
        setIntro(true);
      }
    },
  });
  const isSaved = saved.data ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => (authed ? toggle.mutate({ studyId }) : router.push(signInHref()))}
        disabled={toggle.isPending || (authed && saved.isLoading)}
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

      {intro ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setIntro(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Saved to your reading list"
            className="flex w-full max-w-[460px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex items-center gap-2">
              <BookmarkCheck className="size-5 text-[var(--color-primary)]" aria-hidden />
              <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Saved to your reading list</h3>
            </div>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              You&rsquo;ll find everything you save under the <strong className="font-medium text-[var(--color-text-primary)]">Saved</strong> tab, next to
              &ldquo;All Public Studies&rdquo;. Your reading list is private to you and works across every workspace — saving is separate from following an
              author or tag (which feeds your activity stream).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIntro(false)}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Got it
              </button>
              <Link
                href={"/saved" as Route}
                onClick={() => setIntro(false)}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body)] font-medium text-[var(--color-on-primary)] hover:opacity-90"
              >
                View Saved
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
