"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Monitor, RotateCcw, Smartphone, Tablet, X } from "lucide-react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Live participant preview beside the Builder (ADR-0057 / builder-live-preview).
 * Runs the REAL runtime in preview mode (`studies.startPreview`) in an inline,
 * device-framed iframe and refreshes on a debounce whenever the study changes
 * (`revision`) — re-seeking to the screen the preview was on, so a wording tweak
 * doesn't bounce you back to screen 1. Ephemeral: nothing is counted.
 */
const DEVICES = {
  Mobile: { width: 390, icon: Smartphone },
  Tablet: { width: 768, icon: Tablet },
  Desktop: { width: 960, icon: Monitor },
} as const;
type Device = keyof typeof DEVICES;

export function LivePreviewPane({
  studyId,
  revision,
  width,
  onClose,
}: {
  studyId: string;
  /** Changes whenever the draft is edited (e.g. `study.lastEditedAt`) → triggers a refresh. */
  revision: string;
  /** Pane width in px (resizable from the Builder); falls back to a clamp. */
  width?: number;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<Device>("Mobile");
  const [responseId, setResponseId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const firstRevision = useRef(true);

  const start = api.studies.startPreview.useMutation({ onSuccess: (r) => setResponseId(r.responseId) });
  const begin = start.mutate;

  // Start an ephemeral preview response on mount.
  useEffect(() => {
    begin({ studyId });
  }, [begin, studyId]);

  // On each edit, refresh the iframe but hold the participant's current screen
  // (read from the same-origin iframe URL: /take/{studyId}/{responseId}/{index}).
  useEffect(() => {
    if (firstRevision.current) {
      firstRevision.current = false;
      return;
    }
    if (!responseId) return;
    setUpdating(true);
    const t = setTimeout(() => {
      let idx = 0;
      try {
        const p = iframeRef.current?.contentWindow?.location?.pathname ?? "";
        const m = p.match(/\/take\/[^/]+\/[^/]+\/(\d+)/);
        if (m) idx = Number(m[1]);
      } catch {
        // contentWindow not ready / navigated — fall back to the first screen.
      }
      if (iframeRef.current) iframeRef.current.src = `/take/${studyId}/${responseId}/${idx}`;
      setUpdating(false);
    }, 600);
    return () => clearTimeout(t);
  }, [revision, responseId, studyId]);

  const restart = () => {
    setResponseId(null);
    begin({ studyId });
  };

  const frameWidth = DEVICES[device].width;

  return (
    <aside
      style={width ? { width } : undefined}
      className="flex shrink-0 flex-col gap-2 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-3 [&:not([style])]:w-[clamp(320px,32vw,480px)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Live preview</span>
          <span
            role="status"
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[length:var(--text-small)]",
              updating ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]" : "text-[var(--color-text-muted)]",
            )}
          >
            {updating ? "Updating…" : "Live"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Preview device" className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5">
            {(Object.keys(DEVICES) as Device[]).map((d) => {
              const Icon = DEVICES[d].icon;
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={d}
                  aria-pressed={device === d}
                  title={d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "rounded-[var(--radius-sm)] p-1",
                    device === d ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </button>
              );
            })}
          </div>
          <button type="button" aria-label="Restart preview" title="Restart from the first screen" onClick={restart} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
          <Link href={`/studies/${studyId}/preview` as Route} aria-label="Open full-screen preview" title="Open full-screen preview" className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
            <Maximize2 className="size-3.5" aria-hidden />
          </Link>
          <button type="button" aria-label="Hide live preview" title="Hide live preview" onClick={onClose} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex max-h-[72vh] justify-center overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-2">
        {responseId ? (
          <iframe
            ref={iframeRef}
            title="Live participant preview"
            src={`/take/${studyId}/${responseId}/0`}
            style={{ width: frameWidth, height: "70vh", border: "0" }}
            className="rounded-[var(--radius-sm)] bg-white"
          />
        ) : (
          <div className="flex h-[70vh] items-center justify-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">Starting preview…</div>
        )}
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Participants see the consent screen first; the preview starts after it. Edits refresh here — your place is kept.</p>
    </aside>
  );
}
