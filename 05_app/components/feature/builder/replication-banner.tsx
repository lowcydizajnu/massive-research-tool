"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Replication banner (ADR-0039, replication-builder.md): what is being
 * replicated, under what declared kind, and how far the protocol has drifted.
 * Renders nothing for ordinary studies; never blocks editing on errors.
 */
const INTENT_LABEL: Record<string, string> = {
  direct: "direct replication",
  conceptual: "conceptual replication",
  extension: "extension",
};

export function ReplicationBanner({ studyId }: { studyId: string }) {
  const utils = api.useUtils();
  const { data } = api.studies.replicationStatus.useQuery({ studyId });
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setIntent = api.studies.setReplicationIntent.useMutation({
    onSuccess: () => {
      void utils.studies.replicationStatus.invalidate({ studyId });
      void utils.studies.preflight.invalidate();
    },
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  if (!data) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-accent-subtle)] bg-[var(--color-accent-subtle)]/40 px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
      <span aria-hidden>↳</span>
      <span>
        Replicating{" "}
        <span className="font-medium text-[var(--color-text-primary)]">
          {data.sourceTitle ?? "(original unavailable)"}
        </span>
        {data.sourceAuthor ? ` by ${data.sourceAuthor}` : ""}
      </span>
      <span aria-hidden>·</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 font-medium text-[var(--color-accent-text-on-subtle)] hover:bg-[var(--color-surface-subtle)]"
        >
          {data.intent ? INTENT_LABEL[data.intent] : "kind not declared ▾"}
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            {(["direct", "conceptual", "extension"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setIntent.mutate({ studyId, intent: k });
                }}
                className="flex w-full px-3 py-1.5 text-left text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
              >
                {INTENT_LABEL[k]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <span aria-hidden>·</span>
      <span>
        {data.divergedCount === 0
          ? "no divergence yet"
          : `${data.divergedCount} block${data.divergedCount === 1 ? "" : "s"} diverged${data.removedCount ? ` (${data.removedCount} removed)` : ""}`}
      </span>
      <Link
        href={`/studies/${studyId}/build/whiteboard/compare?vs=origin` as Route}
        className="font-medium text-[var(--color-primary)] hover:underline"
      >
        Compare ↗
      </Link>
    </div>
  );
}
