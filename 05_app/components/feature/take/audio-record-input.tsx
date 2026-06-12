"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Audio-recording block (handoff C2 Group 3) — client component (MediaRecorder
 * can't exist server-side; ADR-0013 exception #3 after reaction-time and
 * reaction toggles). Explicit consent-to-record press → record with a visible
 * countdown (auto-stop at the researcher's limit) → direct-to-R2 upload via the
 * participant presign endpoint → hidden fields carry {r2Key, durationMs} into
 * the screen's form. Re-record replaces the clip.
 */
export function AudioRecordInput({
  config,
  namePrefix = "",
  responseId,
}: {
  config: Record<string, unknown>;
  namePrefix?: string;
  responseId: string;
}) {
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const maxSeconds =
    typeof config.maxDurationSeconds === "number" && Number.isFinite(config.maxDurationSeconds)
      ? config.maxDurationSeconds
      : 60;

  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "done" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [r2Key, setR2Key] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (ticker.current) clearInterval(ticker.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void upload(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      startedAt.current = performance.now();
      setElapsed(0);
      setPhase("recording");
      rec.start();
      ticker.current = setInterval(() => {
        const s = Math.floor((performance.now() - startedAt.current) / 1000);
        setElapsed(s);
        if (s >= maxSeconds) stop();
      }, 250);
    } catch {
      setError("Microphone access was blocked — allow it in your browser to record.");
      setPhase("error");
    }
  };

  const stop = () => {
    if (ticker.current) clearInterval(ticker.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const upload = async (blob: Blob) => {
    setPhase("uploading");
    const dur = Math.round(performance.now() - startedAt.current);
    try {
      const presign = await fetch("/api/take-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, contentType: blob.type || "audio/webm", sizeBytes: blob.size }),
      });
      if (!presign.ok) throw new Error((await presign.json().catch(() => null))?.error ?? "Upload failed.");
      const { uploadUrl, key } = (await presign.json()) as { uploadUrl: string; key: string };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      setR2Key(key);
      setDurationMs(dur);
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
      setPlaybackUrl(URL.createObjectURL(blob));
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPhase("error");
    }
  };

  const btnCls =
    "self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90";

  return (
    <div role="group" aria-labelledby={`${namePrefix}arl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${namePrefix}arl`} className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </p>
      <input type="hidden" name={`${namePrefix}r2key`} value={r2Key} readOnly />
      <input type="hidden" name={`${namePrefix}durms`} value={durationMs || ""} readOnly />

      {phase === "idle" || phase === "error" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            🎙 Recording uses your microphone and is stored with your answers. Up to {maxSeconds}s.
          </p>
          <button type="button" onClick={start} className={btnCls}>
            Start recording
          </button>
        </div>
      ) : phase === "recording" ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
            <span className="size-2.5 animate-pulse rounded-full bg-[var(--color-danger)]" aria-hidden />
            Recording… {elapsed}s / {maxSeconds}s
          </span>
          <button type="button" onClick={stop} className={btnCls}>
            Stop
          </button>
        </div>
      ) : phase === "uploading" ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">Saving your recording…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
            ✓ Recorded ({Math.round(durationMs / 1000)}s) and saved.
          </p>
          {playbackUrl ? <audio controls src={playbackUrl} className="max-w-full" /> : null}
          <button
            type="button"
            onClick={() => {
              setR2Key("");
              setDurationMs(0);
              setPhase("idle");
            }}
            className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
          >
            Re-record
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
