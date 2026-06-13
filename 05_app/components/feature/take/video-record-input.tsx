"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Video-record participant block (ADR-0003 am.; ADR-0013 island): MediaRecorder
 * video sibling of audio-record. Consent-to-record press, max-duration auto-stop,
 * preview + re-record, upload to private R2. Records {r2Key, durationMs}.
 */
export function VideoRecordInput({
  config,
  np,
  responseId,
}: {
  config: Record<string, unknown>;
  np: string;
  responseId: string;
}) {
  const prompt = typeof config.prompt === "string" ? config.prompt : "Record a short video response.";
  const maxSeconds = typeof config.maxDurationSeconds === "number" ? config.maxDurationSeconds : 60;
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "done" | "error">("idle");
  const [left, setLeft] = useState(maxSeconds);
  const [key, setKey] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  useEffect(() => () => { recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      const mime = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "video/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        void upload(blob);
      };
      recRef.current = rec;
      startedAt.current = performance.now();
      rec.start();
      setPhase("recording");
      setLeft(maxSeconds);
    } catch {
      setError("Couldn’t access the camera. Check your browser permissions.");
      setPhase("error");
    }
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const elapsed = (performance.now() - startedAt.current) / 1000;
      const remaining = Math.max(0, Math.ceil(maxSeconds - elapsed));
      setLeft(remaining);
      if (remaining <= 0) stop();
    }, 250);
    return () => clearInterval(t);
  }, [phase, maxSeconds]);

  const stop = () => {
    if (recRef.current && recRef.current.state !== "inactive") {
      setDurationMs(Math.round(performance.now() - startedAt.current));
      recRef.current.stop();
      setPhase("uploading");
    }
  };

  const upload = async (blob: Blob) => {
    try {
      const presign = await fetch("/api/take-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, kind: "video", contentType: "video/webm", sizeBytes: blob.size }),
      });
      if (!presign.ok) throw new Error((await presign.json().catch(() => ({}))).error ?? "Upload failed.");
      const { uploadUrl, key: k } = (await presign.json()) as { uploadUrl: string; key: string };
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/webm" }, body: blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      setKey(k);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPhase("error");
    }
  };

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p>
      {key ? <input type="hidden" name={`${np}r2key`} value={key} /> : null}
      {key ? <input type="hidden" name={`${np}durms`} value={String(durationMs)} /> : null}
      <video ref={videoRef} playsInline controls={phase === "done"} src={phase === "done" && previewUrl ? previewUrl : undefined} className="w-full max-w-[420px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-black" />
      <div className="flex items-center gap-3">
        {phase === "idle" || phase === "error" ? (
          <button type="button" onClick={() => void start()} className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90">Start recording</button>
        ) : null}
        {phase === "recording" ? (
          <button type="button" onClick={stop} className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90">Stop ({left}s)</button>
        ) : null}
        {phase === "done" ? (
          <button type="button" onClick={() => { setKey(""); setPreviewUrl(null); setPhase("idle"); }} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">Re-record</button>
        ) : null}
        <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {phase === "recording" ? "Recording…" : phase === "uploading" ? "Saving…" : phase === "done" ? "Saved." : error ? error : `Max ${maxSeconds}s. Recording starts when you press Start.`}
        </span>
      </div>
    </div>
  );
}
