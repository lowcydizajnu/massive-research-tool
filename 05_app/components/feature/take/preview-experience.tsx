"use client";

import { ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { PreviewShareMenu } from "@/components/feature/take/preview-share-menu";
import { cn } from "@/lib/utils";
import type { RuntimeBlock } from "@/server/runtime/participant";

const WIDTHS = { Desktop: "960px", Tablet: "768px", Mobile: "390px" } as const;
type Device = keyof typeof WIDTHS;
const DEVICES = Object.keys(WIDTHS) as Device[];

/**
 * Chrome-free, device-framed Preview (V1.12 A4, preview-modal.md). A full-
 * viewport overlay above the researcher chrome showing the study exactly as a
 * participant sees it (same `BlockView` renderer), with device-width controls.
 * Nothing is recorded; conditional blocks are all shown (no answers to branch).
 */
export function PreviewExperience({
  studyId,
  title,
  blocks,
}: {
  studyId: string;
  title: string;
  blocks: RuntimeBlock[];
}) {
  const router = useRouter();
  const [device, setDevice] = useState<Device>("Desktop");
  const close = useCallback(() => router.push(`/studies/${studyId}/build`), [router, studyId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface-page)]"
    >
      {/* Control strip — researcher-only; not part of the participant view. */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-4 py-2">
        <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Preview
        </span>
        <div
          role="radiogroup"
          aria-label="Device width"
          className="flex gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5"
        >
          {DEVICES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--text-small)] font-medium",
                device === d
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <PreviewShareMenu studyId={studyId} />
        <a
          href={`/studies/${studyId}/preview`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          Open in new tab
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <button
          type="button"
          onClick={close}
          aria-label="Close preview"
          className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Device-framed participant view. */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto w-full" style={{ maxWidth: WIDTHS[device] }}>
          <PreviewRibbon />
          <h1 className="mt-4 font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
            {title}
          </h1>
          <p className="mb-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Exactly what a participant sees. Nothing is recorded; conditional blocks are all shown
            here regardless of their visibility rules.
          </p>
          {blocks.length === 0 ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              No blocks yet — add some in Builder, then preview.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {blocks.map((b) => (
                <li key={b.instanceId}>
                  <Card>
                    <BlockView block={b} seed={studyId} />
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
