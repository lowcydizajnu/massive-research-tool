"use client";

import { useRef, useState } from "react";

import { BLOCK_COPY_DEFAULTS, type BlockCopyKey } from "@/lib/take/ui-copy";

type BlockCopy = Partial<Record<BlockCopyKey, string>>;

/**
 * File-upload participant block (ADR-0003 am.): presign → PUT to private R2
 * (resp/ key, served as a download — anti-XSS). Records {r2Key, filename}.
 * The choose-file label is researcher-overridable (ADR-0070; blank = default).
 */
export function FileUploadInput({
  config,
  np,
  responseId,
  blockCopy,
}: {
  config: Record<string, unknown>;
  np: string;
  responseId: string;
  blockCopy?: BlockCopy;
}) {
  const prompt = typeof config.prompt === "string" ? config.prompt : "Upload a file.";
  const chooseLabel = blockCopy?.fileUploadChoose || BLOCK_COPY_DEFAULTS.fileUploadChoose;
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setStatus("uploading");
    setError(null);
    try {
      const presign = await fetch("/api/take-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId,
          kind: "document",
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error ?? "Upload failed.");
      const { uploadUrl, key: k } = (await presign.json()) as { uploadUrl: string; key: string };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      setKey(k);
      setName(file.name.slice(0, 300));
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  };

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p>
      {key ? <input type="hidden" name={`${np}r2key`} value={key} /> : null}
      {name ? <input type="hidden" name={`${np}filename`} value={name} /> : null}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        disabled={status === "uploading"}
        onClick={() => fileRef.current?.click()}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
      >
        {status === "uploading" ? "Uploading…" : status === "done" ? "Choose a different file" : chooseLabel}
      </button>
      <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {status === "done" ? `Uploaded: ${name}` : error ? error : "PDF, document, spreadsheet, image, or zip (max 25 MB)."}
      </span>
    </div>
  );
}
