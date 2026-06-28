"use client";

import { useEffect, useRef, useState } from "react";

import { BLOCK_COPY_DEFAULTS, type BlockCopyKey } from "@/lib/take/ui-copy";

type BlockCopy = Partial<Record<BlockCopyKey, string>>;

/**
 * Signature (ADR-0041): draw on a canvas → export PNG → upload to private R2
 * via the participant presign (scoped by responseId). Type-to-sign is the
 * honest keyboard alternative (renders the typed name to the same PNG).
 * Records `{r2Key}` in a hidden field once uploaded. Participant labels are
 * researcher-overridable (ADR-0070; blank = default).
 */
export function SignatureInput({
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
  const prompt = typeof config.prompt === "string" ? config.prompt : "Please sign below.";
  const clearLabel = blockCopy?.signatureClear || BLOCK_COPY_DEFAULTS.signatureClear;
  const typePrompt = blockCopy?.signatureTypePrompt || BLOCK_COPY_DEFAULTS.signatureTypePrompt;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
    }
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    dirty.current = false;
    setTyped("");
    setKey("");
    setStatus("idle");
  };

  const renderTyped = (text: string) => {
    setTyped(text);
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#111827";
    ctx.font = "italic 32px serif";
    ctx.fillText(text, 16, c.height / 2 + 12);
    dirty.current = text.trim() !== "";
  };

  const upload = async () => {
    if (!dirty.current) return;
    setStatus("uploading");
    setError(null);
    try {
      const blob: Blob = await new Promise((res, rej) =>
        canvasRef.current!.toBlob((b) => (b ? res(b) : rej(new Error("Could not read the signature."))), "image/png"),
      );
      const presign = await fetch("/api/take-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, kind: "image", contentType: "image/png", sizeBytes: blob.size }),
      });
      if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error ?? "Upload failed.");
      const { uploadUrl, key: k } = (await presign.json()) as { uploadUrl: string; key: string };
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      setKey(k);
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
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        aria-label="Signature canvas — draw your signature, or use the type-to-sign field below"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => { drawing.current = false; void upload(); }}
        onPointerLeave={() => { if (drawing.current) { drawing.current = false; void upload(); } }}
        className="w-full max-w-[400px] touch-none rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-white"
      />
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{typePrompt}</span>
        <input
          type="text"
          value={typed}
          onChange={(e) => renderTyped(e.target.value)}
          onBlur={() => void upload()}
          className="max-w-[400px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={clear} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">{clearLabel}</button>
        <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {status === "uploading" ? "Saving…" : status === "done" ? "Signature saved." : error ? error : ""}
        </span>
      </div>
    </div>
  );
}
