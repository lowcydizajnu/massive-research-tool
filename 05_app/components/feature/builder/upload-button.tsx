"use client";

import { useRef, useState } from "react";

import { api } from "@/lib/trpc/react";
import type { UploadKind } from "@/lib/uploads";

/**
 * "Upload from computer" for media config fields (ADR-0003): presign → direct
 * browser PUT to R2 → hand back the stable /api/media URL. Errors (type/size/
 * storage unconfigured) surface inline.
 */
export function UploadButton({
  kind,
  onUploaded,
  label = "Upload…",
}: {
  kind: UploadKind;
  onUploaded: (publicUrl: string) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presign = api.uploads.presign.useMutation();

  const accept = { image: "image/*", video: "video/*", audio: "audio/*", document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/*" }[kind];

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { uploadUrl, publicUrl } = await presign.mutateAsync({
        kind,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
      onUploaded(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <span className="flex flex-col gap-1">
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
      >
        {busy ? "Uploading…" : label}
      </button>
      {error ? (
        <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
