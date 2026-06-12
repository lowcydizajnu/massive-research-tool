"use client";

import { useEffect, useState } from "react";

/**
 * Right-panel side preference (IA v0.4 M4, ADR-0032): the Builder's context
 * panel sits right by default; left-handed researchers can flip it. Per-device
 * (localStorage) — BuilderWorkspace listens via the custom event so an open
 * Builder tab updates live.
 */
export const PANEL_SIDE_KEY = "mrt-panel-side";
export const PANEL_SIDE_EVENT = "mrt-panel-side-change";

export type PanelSide = "right" | "left";

export function readPanelSide(): PanelSide {
  try {
    return localStorage.getItem(PANEL_SIDE_KEY) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

export function PanelSideToggle() {
  const [side, setSide] = useState<PanelSide>("right");
  useEffect(() => setSide(readPanelSide()), []);

  const pick = (next: PanelSide) => {
    setSide(next);
    try {
      localStorage.setItem(PANEL_SIDE_KEY, next);
    } catch {
      // private mode — session-only
    }
    window.dispatchEvent(new CustomEvent(PANEL_SIDE_EVENT, { detail: next }));
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Study panel position
        </span>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Where the Details / Configure panel sits in the Builder. Saved on this device.
        </span>
      </div>
      <div role="radiogroup" aria-label="Study panel position" className="flex gap-1">
        {(["left", "right"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={side === opt}
            onClick={() => pick(opt)}
            className={`rounded-[var(--radius-md)] border px-3 py-1 text-[length:var(--text-small)] font-medium ${
              side === opt
                ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            }`}
          >
            {opt === "left" ? "Left" : "Right"}
          </button>
        ))}
      </div>
    </div>
  );
}
