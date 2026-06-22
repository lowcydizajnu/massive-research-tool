"use client";

import { FileText, Film, ImageIcon, Music } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/trpc/react";
import type { UploadKind } from "@/lib/uploads";

/**
 * "Pick from Materials" for block media-config fields (ADR-0064, Library L3 — the
 * owner-pinned flow). Opens a modal grid of workspace materials filtered to the
 * field's kind; selecting one sets the field to the material's `/api/media/<key>`
 * URL (the durable R2 key, orphan-safe) and bumps its use-count. Sits beside the
 * existing "Upload from computer" button.
 */
const KIND_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
};

export function PickFromMaterialsButton({
  kind,
  onPick,
}: {
  kind: UploadKind;
  onPick: (publicUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = api.materials.list.useQuery({ kind }, { enabled: open });
  const touch = api.materials.touch.useMutation();
  const rows = list.data ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        Pick from Materials…
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pick from Materials"
            className="flex max-h-[80vh] w-full max-w-[560px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
                Pick from Materials
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Close
              </button>
            </div>

            {list.isLoading ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                No {kind} materials yet. Upload one in Library → Materials, then pick it here.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {rows.map((m) => {
                  const Icon = KIND_ICON[m.kind] ?? FileText;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(`/api/media/${m.r2Key}`);
                          touch.mutate({ materialId: m.id });
                          setOpen(false);
                        }}
                        className="flex w-full flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2 text-left hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-subtle)]"
                      >
                        <span className="flex aspect-video items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]">
                          {m.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/media/${m.r2Key}`} alt="" className="size-full object-cover" />
                          ) : (
                            <Icon className="size-6 text-[var(--color-text-muted)]" aria-hidden />
                          )}
                        </span>
                        <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-primary)]">{m.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
