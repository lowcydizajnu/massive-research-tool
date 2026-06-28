"use client";

import { useState } from "react";

import { BLOCK_COPY_DEFAULTS, type BlockCopyKey } from "@/lib/take/ui-copy";

/**
 * Drill-down participant input (ADR-0013 client-JS exception #4): cascading
 * dependent selects. The chosen path is mirrored into hidden inputs the server
 * action reads (`${np}drill_0`, `${np}drill_1`, …). No-JS degrades to the first
 * level only (documented JS-required for deeper levels).
 */
type Node = { label: string; children?: Node[] };

const FIELD_CLS =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]";

export function DrillDownInput({
  config,
  np,
  blockCopy,
}: {
  config: Record<string, unknown>;
  np: string;
  blockCopy?: Partial<Record<BlockCopyKey, string>>;
}) {
  const options = (Array.isArray(config.options) ? config.options : []) as Node[];
  const levelLabels = (Array.isArray(config.levelLabels) ? config.levelLabels : []) as string[];
  const required = config.required !== false;
  const choosePlaceholder = blockCopy?.drillChoose || BLOCK_COPY_DEFAULTS.drillChoose;
  const [path, setPath] = useState<string[]>([]);

  // Walk the tree along the chosen path to get the options at each visible level.
  const levels: Node[][] = [options];
  let nodes = options;
  for (const step of path) {
    const match = nodes.find((n) => n.label === step);
    if (!match?.children?.length) break;
    levels.push(match.children);
    nodes = match.children;
  }

  return (
    <div role="group" aria-labelledby={`${np}gl`} className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      <p id={`${np}gl`} className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {typeof config.prompt === "string" ? config.prompt : ""}
      </p>
      {path.map((step, i) => (
        <input key={`h${i}`} type="hidden" name={`${np}drill_${i}`} value={step} />
      ))}
      {levels.map((levelNodes, i) => (
        <label key={i} className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {levelLabels[i] ?? `Level ${i + 1}`}
          </span>
          <select
            className={FIELD_CLS}
            value={path[i] ?? ""}
            required={required && i === 0}
            onChange={(e) => {
              const next = path.slice(0, i);
              if (e.target.value) next.push(e.target.value);
              setPath(next);
            }}
          >
            <option value="" disabled>
              {choosePlaceholder}
            </option>
            {levelNodes
              .filter((n) => n.label.trim() !== "")
              .map((n, j) => (
                <option key={`${j}-${n.label}`} value={n.label}>
                  {n.label}
                </option>
              ))}
          </select>
        </label>
      ))}
    </div>
  );
}
