"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConditionGroup } from "@/lib/whiteboard/conditions";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/** The block shape `studies.setBlocks` accepts (restore payload). */
export type BlockSnapshotInput = {
  instanceId: string;
  source: string;
  key: string;
  version: string;
  config: Record<string, unknown>;
  title?: string;
  visibility?: { showIfCondition?: string[] };
  branchRules?: { fromInstanceId: string; equals: string }[];
  showIf?: ConditionGroup;
};

/** Project a StudyBlock to the restore payload (drops display-only fields). */
function toInput(b: StudyBlock): BlockSnapshotInput {
  const out: BlockSnapshotInput = {
    instanceId: b.instanceId,
    source: b.source,
    key: b.key,
    version: b.version,
    config: b.config,
  };
  if (b.title?.trim()) out.title = b.title.trim();
  if (b.showIfCondition.length) out.visibility = { showIfCondition: b.showIfCondition };
  if (b.branchRules.length) out.branchRules = b.branchRules;
  if (b.showIf) out.showIf = b.showIf;
  return out;
}

const MAX = 50;

type History = { past: string[]; future: string[] };

/**
 * Undo/redo history for a study's blocks (Builder + Whiteboard). Watches the
 * blocks and, on each *user* change, pushes the prior snapshot onto `past` and
 * clears `future`; the per-study history is kept in sessionStorage (survives
 * switching between Builder and Whiteboard; cleared when the tab closes).
 * `undo()`/`redo()` restore a snapshot via `onRestore` (the `setBlocks`
 * mutation) without re-recording it. All restores write the working draft only —
 * saved versions and frozen preregistrations are never touched.
 */
export function useBlockHistory(
  studyId: string,
  blocks: StudyBlock[],
  onRestore: (blocks: BlockSnapshotInput[]) => void,
) {
  const storageKey = `mrt-history:${studyId}`;
  const serialized = useMemo(() => JSON.stringify(blocks.map(toInput)), [blocks]);
  const [hist, setHist] = useState<History>({ past: [], future: [] });
  const restoring = useRef(false);
  const baseline = useRef<string | null>(null);

  const persist = useCallback(
    (h: History): History => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(h));
      } catch {
        /* ignore */
      }
      return h;
    },
    [storageKey],
  );

  // Hydrate from the prior in-tab state.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setHist(JSON.parse(raw) as History);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Capture distinct states. The first observed state is the baseline (not an
  // edit); a change caused by undo/redo is skipped so it doesn't re-enter.
  useEffect(() => {
    if (baseline.current === null) {
      baseline.current = serialized;
      return;
    }
    if (serialized === baseline.current) return;
    if (restoring.current) {
      restoring.current = false;
      baseline.current = serialized;
      return;
    }
    const prior = baseline.current;
    baseline.current = serialized;
    setHist((h) => persist({ past: [...h.past, prior].slice(-MAX), future: [] }));
  }, [serialized, persist]);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.past.length === 0 || baseline.current === null) return h;
      const target = h.past[h.past.length - 1];
      const present = baseline.current;
      restoring.current = true;
      onRestore(JSON.parse(target) as BlockSnapshotInput[]);
      return persist({ past: h.past.slice(0, -1), future: [...h.future, present] });
    });
  }, [onRestore, persist]);

  const redo = useCallback(() => {
    setHist((h) => {
      if (h.future.length === 0 || baseline.current === null) return h;
      const target = h.future[h.future.length - 1];
      const present = baseline.current;
      restoring.current = true;
      onRestore(JSON.parse(target) as BlockSnapshotInput[]);
      return persist({ past: [...h.past, present], future: h.future.slice(0, -1) });
    });
  }, [onRestore, persist]);

  return { canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, undo, redo };
}
