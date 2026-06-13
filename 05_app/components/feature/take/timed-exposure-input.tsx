"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Timed-exposure stimulus (ADR-0040, ADR-0013 island): show content for
 * exactly `exposureMs`, then hide it; record the actual display time
 * (client-measured, never server-trusted) in a hidden `${np}shownMs` field.
 */
export function TimedExposureInput({
  config,
  np,
}: {
  config: Record<string, unknown>;
  np: string;
}) {
  const exposureMs = typeof config.exposureMs === "number" ? config.exposureMs : 2000;
  const content = typeof config.content === "string" ? config.content : "";
  const imageUrl = typeof config.imageUrl === "string" ? config.imageUrl.trim() : "";
  const [visible, setVisible] = useState(true);
  const shownRef = useRef<HTMLInputElement>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    start.current = performance.now();
    const t = setTimeout(() => {
      setVisible(false);
      if (shownRef.current && start.current != null) {
        shownRef.current.value = String(Math.round(performance.now() - start.current));
      }
    }, exposureMs);
    return () => clearTimeout(t);
  }, [exposureMs]);

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <input ref={shownRef} type="hidden" name={`${np}shownMs`} defaultValue={String(exposureMs)} />
      {visible ? (
        <div className="flex flex-col gap-3">
          {content ? <p className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{content}</p> : null}
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus URL
            <img src={imageUrl} alt="" className="max-h-[420px] w-full rounded-[var(--radius-md)] object-contain" />
          ) : null}
        </div>
      ) : (
        <p aria-live="polite" className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          (Stimulus hidden — continue when you’re ready.)
        </p>
      )}
    </div>
  );
}
