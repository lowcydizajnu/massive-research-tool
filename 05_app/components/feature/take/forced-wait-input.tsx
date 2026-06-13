"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Forced-wait (ADR-0040, ADR-0013 island): disable the screen's Continue button
 * (the `data-take-continue` contract) for `waitSeconds`, then re-enable. Records
 * the actual wait in a hidden `${np}waitedMs` field (client-measured).
 */
export function ForcedWaitInput({
  config,
  np,
}: {
  config: Record<string, unknown>;
  np: string;
}) {
  const waitSeconds = typeof config.waitSeconds === "number" ? config.waitSeconds : 5;
  const content = typeof config.content === "string" ? config.content : "";
  const [left, setLeft] = useState(waitSeconds);
  const waitedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>("[data-take-continue]");
    const start = performance.now();
    if (btn) btn.disabled = true;
    const tick = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const remaining = Math.max(0, Math.ceil(waitSeconds - elapsed));
      setLeft(remaining);
      if (waitedRef.current) waitedRef.current.value = String(Math.round(performance.now() - start));
      if (remaining <= 0) {
        clearInterval(tick);
        if (btn) btn.disabled = false;
      }
    }, 200);
    return () => {
      clearInterval(tick);
      if (btn) btn.disabled = false; // never strand a participant if the block unmounts
    };
  }, [waitSeconds]);

  return (
    <div className="flex flex-col gap-2">
      {content ? <p className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{content}</p> : null}
      <input ref={waitedRef} type="hidden" name={`${np}waitedMs`} defaultValue="0" />
      <p aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {left > 0 ? `You can continue in ${left}s…` : "You can continue now."}
      </p>
    </div>
  );
}
