"use client";

import { useRef, useState } from "react";

/**
 * Reaction-time block (V1.12 Wave 3). Client-only because it measures latency:
 * after Start, a stimulus appears following a random delay, and we record
 * `performance.now()` from stimulus-onset to the participant's Respond click
 * into the hidden `value` field (ms). Server-rendered blocks can't time input,
 * so this is the one participant block that needs client JS (ADR-0013 exception
 * scoped to this component).
 */
type Phase = "idle" | "waiting" | "ready" | "done";

function n(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function ReactionTimeInput({ config }: { config: Record<string, unknown> }) {
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const stimulus = (typeof config.stimulus === "string" && config.stimulus) || "GO";
  const minDelay = n(config.minDelayMs, 1000);
  const maxDelay = Math.max(minDelay, n(config.maxDelayMs, 3000));

  const [phase, setPhase] = useState<Phase>("idle");
  const [rt, setRt] = useState<number | null>(null);
  const [early, setEarly] = useState(false);
  const shownAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    setRt(null);
    setEarly(false);
    setPhase("waiting");
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    timer.current = setTimeout(() => {
      shownAt.current = performance.now();
      setPhase("ready");
    }, delay);
  };

  const respond = () => {
    if (phase === "waiting") {
      // Jumped the gun — cancel and make them restart.
      if (timer.current) clearTimeout(timer.current);
      setEarly(true);
      setPhase("idle");
      return;
    }
    if (phase !== "ready") return;
    setRt(Math.round(performance.now() - shownAt.current));
    setPhase("done");
  };

  const box =
    "flex min-h-[140px] w-full items-center justify-center rounded-[var(--radius-md)] border text-[length:var(--text-display)] font-medium";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {prompt}
      </p>
      <input type="hidden" name="value" value={rt ?? ""} readOnly />

      {phase === "idle" ? (
        <button
          type="button"
          onClick={start}
          className="self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          Start
        </button>
      ) : phase === "waiting" ? (
        <button
          type="button"
          onClick={respond}
          className={`${box} border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]`}
        >
          Wait for the cue…
        </button>
      ) : phase === "ready" ? (
        <button
          type="button"
          onClick={respond}
          className={`${box} border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]`}
        >
          {stimulus}
        </button>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <div
            className={`${box} border-[var(--color-success-subtle)] bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]`}
          >
            {rt} ms
          </div>
          <button
            type="button"
            onClick={start}
            className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {early ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Too early — wait for the cue, then respond.
        </p>
      ) : null}
    </div>
  );
}
