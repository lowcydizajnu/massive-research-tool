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

/**
 * Edit-history for a study's blocks (Builder + Whiteboard undo). Watches the
 * blocks and, on each *user* change, pushes the prior snapshot onto a per-study
 * stack kept in sessionStorage (so it survives switching between Builder and
 * Whiteboard; cleared when the tab closes). `undo()` restores the previous
 * snapshot via `onRestore` (the `setBlocks` mutation) without re-recording it.
 */
export function useBlockHistory(
  studyId: string,
  blocks: StudyBlock[],
  onRestore: (blocks: BlockSnapshotInput[]) => void,
) {
  const storageKey = `mrt-undo:${studyId}`;
  const serialized = useMemo(() => JSON.stringify(blocks.map(toInput)), [blocks]);
  const [stack, setStack] = useState<string[]>([]);
  const restoring = useRef(false);
  const baseline = useRef<string | null>(null);

  // Hydrate the stack from the prior in-tab state.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setStack(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Capture distinct states. The first observed state is the baseline (not an
  // edit); a change caused by undo is skipped so it doesn't re-enter the stack.
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
    setStack((s) => {
      const next = [...s, baseline.current as string].slice(-MAX);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    baseline.current = serialized;
  }, [serialized, storageKey]);

  const undo = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      const next = s.slice(0, -1);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      restoring.current = true;
      onRestore(JSON.parse(prev) as BlockSnapshotInput[]);
      return next;
    });
  }, [onRestore, storageKey]);

  return { canUndo: stack.length > 0, undo };
}
