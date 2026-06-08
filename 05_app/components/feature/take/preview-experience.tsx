"use client";

import { ExternalLink, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PreviewShareMenu } from "@/components/feature/take/preview-share-menu";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

const WIDTHS = { Desktop: "960px", Tablet: "768px", Mobile: "390px" } as const;
type Device = keyof typeof WIDTHS;
const DEVICES = Object.keys(WIDTHS) as Device[];

/**
 * Chrome-free, device-framed Preview (V1.12, preview-modal.md). Runs the REAL
 * participant runtime in preview mode (`studies.startPreview` → an ephemeral
 * `mode:"preview"` response on the working draft) inside an iframe — one screen
 * at a time, with live validation + branching, exactly as a participant sees it.
 * Nothing counts toward results (preview responses are excluded). "Restart"
 * spins up a fresh preview run.
 */
export function PreviewExperience({ studyId, title }: { studyId: string; title: string }) {
  const router = useRouter();
  const [device, setDevice] = useState<Device>("Desktop");
  const [responseId, setResponseId] = useState<string | null>(null);
  const close = useCallback(() => router.push(`/studies/${studyId}/build`), [router, studyId]);

  const start = api.studies.startPreview.useMutation({
    onSuccess: (r) => setResponseId(r.responseId),
  });
  // Start one preview run on mount; `start` identity is stable across renders.
  const begin = start.mutate;
  useEffect(() => {
    begin({ studyId });
  }, [begin, studyId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const restart = () => {
    setResponseId(null);
    start.mutate({ studyId });
  };

  const runUrl = responseId ? `/take/${studyId}/${responseId}/0` : null;

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
        <button
          type="button"
          onClick={restart}
          disabled={start.isPending}
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Restart
        </button>
        <div className="flex-1" />
        <PreviewShareMenu studyId={studyId} />
        {runUrl ? (
          <a
            href={runUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Open in new tab
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
        <button
          type="button"
          onClick={close}
          aria-label="Close preview"
          className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Device-framed REAL participant run. */}
      <div className="flex-1 overflow-hidden p-6">
        <div
          className="mx-auto flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-md)]"
          style={{ maxWidth: WIDTHS[device] }}
        >
          {start.isError ? (
            <p role="alert" className="m-auto max-w-[40ch] text-center text-[length:var(--text-body)] text-[var(--color-danger-text-on-subtle)]">
              Couldn’t start the preview. Add at least one block in Builder, then try Restart.
            </p>
          ) : runUrl ? (
            <iframe
              key={responseId}
              src={runUrl}
              title={`Participant preview of ${title}`}
              className="h-full w-full border-0"
            />
          ) : (
            <p className="m-auto text-[length:var(--text-body)] text-[var(--color-text-muted)]">
              Starting preview…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
