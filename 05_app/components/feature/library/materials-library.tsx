"use client";

import { FileText, Film, ImageIcon, Music, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { api } from "@/lib/trpc/react";
import type { UploadKind } from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * Library · Materials (library-materials-tab.md, ADR-0064). A workspace media
 * library: + Upload (presign → direct R2 PUT → materials.upload) and a filtered
 * grid. Assets are inserted into blocks via the Builder's Pick-from-Materials
 * picker (it stores the R2 key, orphan-safe). Workspace-scoped.
 */
type KindFilter = "all" | UploadKind;

const KINDS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "document", label: "Documents" },
];

const KIND_ICON: Record<string, typeof ImageIcon> = { image: ImageIcon, video: Film, audio: Music, document: FileText };

function kindOf(file: File): UploadKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

export function MaterialsLibrary() {
  const utils = api.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = api.materials.list.useQuery({
    kind: kind === "all" ? undefined : kind,
    search: search.trim() || undefined,
  });
  const presign = api.uploads.presign.useMutation();
  const upload = api.materials.upload.useMutation({ onSuccess: () => void utils.materials.list.invalidate() });
  const del = api.materials.delete.useMutation({ onSuccess: () => void utils.materials.list.invalidate() });
  const rows = list.data ?? [];

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const k = kindOf(file);
      const { uploadUrl, key } = await presign.mutateAsync({
        kind: k,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      await upload.mutateAsync({
        key,
        kind: k,
        name: file.name.replace(/\.[^.]+$/, "") || file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.value}
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
                kind === k.value
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto min-w-0 max-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1 text-[length:var(--text-small)] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Upload className="size-3.5" aria-hidden /> {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{error}</p>
      ) : null}

      {list.isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading materials…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-8">
          <p className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">No materials yet</p>
          <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            Upload an image, audio, video, or document with <strong>Upload</strong> — then drop it into any block via
            <strong> Pick from Materials</strong> in the Builder.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((m) => {
            const Icon = KIND_ICON[m.kind] ?? FileText;
            return (
              <li key={m.id} className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-2">
                <span className="flex aspect-video items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${m.r2Key}`} alt="" className="size-full object-cover" />
                  ) : (
                    <Icon className="size-7 text-[var(--color-text-muted)]" aria-hidden />
                  )}
                </span>
                <span className="flex items-start justify-between gap-1">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">{m.name}</span>
                    <span className="text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{m.kind} · used {m.useCount}×</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${m.name}`}
                    onClick={() => {
                      if (confirm(`Delete “${m.name}”? Studies already using it keep working.`)) del.mutate({ materialId: m.id });
                    }}
                    className="shrink-0 rounded-[var(--radius-md)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
