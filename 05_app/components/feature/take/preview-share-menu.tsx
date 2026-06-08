"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

/**
 * Share-preview-link menu (V1.12 I). Creates a 7-day signed link anyone can open
 * without an account, copies it, and lists active links with Revoke. Lives in
 * the Preview overlay control strip.
 */
export function PreviewShareMenu({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const utils = api.useUtils();

  const list = api.previewTokens.list.useQuery({ studyId }, { enabled: open });
  const create = api.previewTokens.create.useMutation({
    onSuccess: async (r) => {
      const url = `${window.location.origin}/preview/${r.studyId}?token=${r.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        /* clipboard may be blocked; the link still exists in the list */
      }
      await utils.previewTokens.list.invalidate({ studyId });
    },
  });
  const revoke = api.previewTokens.revoke.useMutation({
    onSuccess: () => utils.previewTokens.list.invalidate({ studyId }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = (list.data ?? []).filter((t) => t.active);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
        {copied ? "Link copied" : "Share link"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Share preview links"
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <p className="mb-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Anyone with the link can view this draft (no account needed). Links expire in 7 days.
          </p>
          <PendingButton
            pending={create.isPending}
            idleLabel="Create + copy link"
            pendingLabel="Creating…"
            onClick={() => create.mutate({ studyId })}
            className="w-full justify-center"
          />
          {active.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-2">
              {active.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-[length:var(--text-small)]">
                  <span className="text-[var(--color-text-muted)]">
                    Created {fmt(t.createdAt)} · expires {fmt(t.expiresAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke.mutate({ tokenId: t.id })}
                    disabled={revoke.isPending}
                    className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 font-medium text-[var(--color-danger-text-on-subtle)] hover:bg-[var(--color-danger-subtle)] disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
