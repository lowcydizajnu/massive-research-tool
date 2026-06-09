"use client";

import { Plus, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { BlockVisibilityField } from "@/components/feature/builder/block-visibility-field";
import { ConfigureForm } from "@/components/feature/builder/configure-form";
import { ModeToggle } from "@/components/feature/builder/mode-toggle";
import { ModulePicker } from "@/components/feature/builder/module-picker";
import { api } from "@/lib/trpc/react";
import type { StudyBlock, StudyDetail } from "@/server/trpc/routers/studies";
import { regroupAfterMove, setBlockGroup } from "@/lib/whiteboard/screens";

import {
  isConditionSource,
  newlyBrokenByReorder,
  normalizeCondition,
  summarizeClause,
} from "@/lib/whiteboard/conditions";
import { useBlockHistory } from "@/lib/whiteboard/use-block-history";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { ConditionBuilder } from "./condition-builder";
import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardList } from "./whiteboard-list";
import { cn } from "@/lib/utils";

/**
 * Whiteboard mode workspace (ADR-0020). The graph view of a study with the same
 * round-trip edits as Builder — add (ModulePicker), remove + configure
 * (ConfigureForm), and visibility wiring (BlockVisibilityField) — all flowing
 * through the existing Builder tRPC mutations (no new edit endpoints, A5).
 * Selecting a node opens the shared Configure panel; the canvas re-derives from
 * the same `definition_snapshot.blocks` after each mutation.
 */
export function WhiteboardWorkspace({ study: initial }: { study: StudyDetail }) {
  const utils = api.useUtils();
  const { data } = api.studies.get.useQuery({ id: initial.id }, { initialData: initial });
  const study = data ?? initial;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<"canvas" | "list">("canvas");

  const invalidate = () => utils.studies.get.invalidate({ id: study.id });
  const addBlock = api.studies.addBlock.useMutation({
    onSuccess: ({ instanceId }) => {
      setSelectedId(instanceId);
      setPickerOpen(false);
      void invalidate();
    },
  });
  const removeBlock = api.studies.removeBlock.useMutation({ onSuccess: () => void invalidate() });
  const updateConfig = api.studies.updateBlockConfig.useMutation({ onSuccess: () => void invalidate() });
  const renameBlock = api.studies.setBlockTitle.useMutation({ onSuccess: () => void invalidate() });
  const setGroupsMut = api.studies.setGroups.useMutation({ onSuccess: () => void invalidate() });
  const toInstance = (b: StudyBlock, groupId: string | null) => ({
    instanceId: b.instanceId,
    source: b.source,
    key: b.key,
    version: b.version,
    config: b.config,
    ...(b.title ? { title: b.title } : {}),
    ...(b.showIfCondition.length ? { visibility: { showIfCondition: b.showIfCondition } } : {}),
    ...(b.branchRules.length ? { branchRules: b.branchRules } : {}),
    ...(b.showIf ? { showIf: b.showIf } : {}),
    ...(groupId ? { groupId } : {}),
  });
  const [pendingReorder, setPendingReorder] = useState<{
    blocks: ReturnType<typeof toInstance>[];
    groups: StudyDetail["groups"];
    items: string[];
  } | null>(null);
  const nameOfBlock = (id: string) => {
    const b = study.blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };
  // Drag a block into a group container (groupId) or out of one (null) on the
  // canvas → set membership + re-make groups contiguous, then persist (ADR-0028).
  const regroupOnCanvas = (blockId: string, groupId: string | null) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const normalized = setBlockGroup(
      study.blocks.map((b) => ({ instanceId: b.instanceId, groupId: b.groupId })),
      blockId,
      groupId,
    );
    const blocks = normalized.map((r) => toInstance(byId.get(r.instanceId)!, r.groupId));
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = study.groups.filter((g) => usedIds.has(g.id));
    setGroupsMut.mutate({ studyId: study.id, blocks, groups });
  };
  // Gate a whole group by an arm (ADR-0028): wiring a Condition node → a group
  // container sets/clears that arm on EVERY member block (runtime already filters
  // by arm at the block level, so the group screen only shows for that arm).
  const persistGroupArm = (groupId: string, armOf: (b: StudyBlock) => string[]) => {
    const blocks = study.blocks.map((b) => {
      const arms = b.groupId === groupId ? armOf(b) : b.showIfCondition;
      return {
        instanceId: b.instanceId,
        source: b.source,
        key: b.key,
        version: b.version,
        config: b.config,
        ...(b.title ? { title: b.title } : {}),
        ...(arms.length ? { visibility: { showIfCondition: arms } } : {}),
        ...(b.branchRules.length ? { branchRules: b.branchRules } : {}),
        ...(b.showIf ? { showIf: b.showIf } : {}),
        ...(b.groupId ? { groupId: b.groupId } : {}),
      };
    });
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    setGroupsMut.mutate({ studyId: study.id, blocks, groups: study.groups.filter((g) => usedIds.has(g.id)) });
  };
  const connectGroupArm = (groupId: string, slug: string) =>
    persistGroupArm(groupId, (b) => (b.showIfCondition.includes(slug) ? b.showIfCondition : [...b.showIfCondition, slug]));
  const disconnectGroupArm = (groupId: string, slug: string) =>
    persistGroupArm(groupId, (b) => b.showIfCondition.filter((s) => s !== slug));
  const requestReorder = (order: string[], movedId: string) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const regrouped = regroupAfterMove(
      order.map((id) => ({ instanceId: id, groupId: byId.get(id)?.groupId ?? null })),
      movedId,
    );
    const orderedStudyBlocks = regrouped.map((r) => ({ ...byId.get(r.instanceId)!, groupId: r.groupId }));
    const broken = newlyBrokenByReorder(study.blocks, orderedStudyBlocks);
    const blocks = regrouped.map((r) => toInstance(byId.get(r.instanceId)!, r.groupId));
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = study.groups.filter((g) => usedIds.has(g.id));
    if (broken.length === 0) {
      setGroupsMut.mutate({ studyId: study.id, blocks, groups });
      return;
    }
    setPendingReorder({
      blocks,
      groups,
      items: broken.map((b) => `"${nameOfBlock(b.targetId)}": ${summarizeClause(b.clause, nameOfBlock)}`),
    });
  };
  const setCondition = api.studies.setBlockCondition.useMutation({ onSuccess: () => void invalidate() });
  // Bump on a restore (undo/redo) so the right-panel editors re-seed from the
  // restored data — they hold local state keyed by block id, which is unchanged
  // by a restore. Normal edits don't bump it, so typing isn't interrupted.
  const [panelEpoch, setPanelEpoch] = useState(0);
  const setBlocksMut = api.studies.setBlocks.useMutation({
    onSuccess: () => {
      void invalidate();
      setPanelEpoch((e) => e + 1);
    },
  });
  const { canUndo, canRedo, undo, redo } = useBlockHistory(study.id, study.blocks, (blocks) =>
    setBlocksMut.mutate({ studyId: study.id, blocks }),
  );

  // Conditions drive the canvas wires (drag a Condition node → a block to gate it).
  const conditions = api.studies.listConditions.useQuery({ studyId: study.id });
  const setVisibility = api.studies.setBlockVisibility.useMutation({ onSuccess: () => void invalidate() });
  const setBlockConditions = (instanceId: string, showIfCondition: string[]) =>
    setVisibility.mutate({ studyId: study.id, instanceId, showIfCondition });
  const connectCondition = (blockId: string, slug: string) => {
    const b = study.blocks.find((x) => x.instanceId === blockId);
    if (!b || b.showIfCondition.includes(slug)) return;
    setBlockConditions(blockId, [...b.showIfCondition, slug]);
  };
  const disconnectCondition = (blockId: string, slug: string) => {
    const b = study.blocks.find((x) => x.instanceId === blockId);
    if (!b) return;
    setBlockConditions(blockId, b.showIfCondition.filter((s) => s !== slug));
  };

  // Block→block wire (ADR-0021 amendment): create a FLAT connection (no modal) —
  // "answered" links the source to the target unconditionally. Refine it to a
  // real condition (operator + value) in the right-panel ConditionBuilder. A
  // block may have multiple incoming wires (multiple sources → OR by default).
  const connectBranch = (targetId: string, sourceId: string) => {
    const target = study.blocks.find((x) => x.instanceId === targetId);
    const source = study.blocks.find((x) => x.instanceId === sourceId);
    if (!target || !source) return;
    setSelectedId(targetId); // open the target's panel to refine
    if (!isConditionSource(source.key)) return; // a stimulus has no answer to gate on
    const existing = normalizeCondition(target.showIf, target.branchRules);
    if (existing?.clauses.some((c) => c.fromInstanceId === sourceId)) return; // already wired
    const clauses = [
      ...(existing?.clauses ?? []),
      { fromInstanceId: sourceId, operator: "answered" as const, value: [] },
    ];
    setCondition.mutate({ studyId: study.id, instanceId: targetId, showIf: { op: existing?.op ?? "or", clauses } });
  };
  const disconnectBranch = (targetId: string, sourceId: string) => {
    const target = study.blocks.find((x) => x.instanceId === targetId);
    if (!target) return;
    const existing = normalizeCondition(target.showIf, target.branchRules);
    const clauses = (existing?.clauses ?? []).filter((c) => c.fromInstanceId !== sourceId);
    setCondition.mutate({
      studyId: study.id,
      instanceId: targetId,
      showIf: clauses.length ? { op: existing?.op ?? "and", clauses } : null,
    });
  };

  const selected = study.blocks.find((b) => b.instanceId === selectedId) ?? null;

  // Keep selection valid if a block disappears (e.g. removed).
  useEffect(() => {
    if (selectedId && !study.blocks.some((b) => b.instanceId === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, study.blocks]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Build" />
      <div className="flex flex-1 gap-3">
        <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
                {study.title}
              </h1>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Whiteboard — blocks as a graph, visibility rules as wires. Click a block to configure it.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo || setBlocksMut.isPending}
                title="Undo last change"
                aria-label="Undo last change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo || setBlocksMut.isPending}
                title="Redo"
                aria-label="Redo last undone change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Redo2 className="size-4" aria-hidden />
              </button>
              <div role="group" aria-label="Whiteboard view" className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5 text-[length:var(--text-small)]">
                {(["canvas", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 font-medium capitalize",
                      view === v
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  <Plus className="size-4" aria-hidden />
                  Add block
                </button>
                {pickerOpen ? (
                  <ModulePicker
                    pending={addBlock.isPending}
                    onClose={() => setPickerOpen(false)}
                    onInsert={(m) => addBlock.mutate({ studyId: study.id, ...m })}
                  />
                ) : null}
              </div>
              <Link
                href={`/studies/${study.id}/build/whiteboard/compare` as Route}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Compare versions
              </Link>
              <ModeToggle studyId={study.id} mode="whiteboard" />
            </div>
          </div>

          {view === "canvas" ? (
            <>
              <WhiteboardCanvas
                study={study}
                conditions={(conditions.data ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
                selectedId={selectedId}
                onSelectBlock={setSelectedId}
                onConnectCondition={connectCondition}
                onDisconnectCondition={disconnectCondition}
                onConnectBranch={connectBranch}
                onDisconnectBranch={disconnectBranch}
                onRegroup={regroupOnCanvas}
                onConnectGroupArm={connectGroupArm}
                onDisconnectGroupArm={disconnectGroupArm}
              />
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {"Drag a wire from one block to another to branch on its answer; or from a Condition node to a block (or a group box) to gate it by arm. Drag a block into a group box to add it to that screen, or out to remove it; drag a group box to move the whole group. Select a wire and press Delete to remove it."}
                {(conditions.data ?? []).length === 0
                  ? " Add conditions in Builder’s Conditions section to wire arm-visibility too."
                  : ""}
              </p>
            </>
          ) : (
            <WhiteboardList
              blocks={study.blocks}
              groups={study.groups}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={requestReorder}
            />
          )}
        </section>

        {/* Right context panel — Configure the selected block (shared with Builder). */}
        <aside className="flex w-[250px] shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
          {selected ? (
            <>
              <ConfigureForm
                key={`${selected.instanceId}-${panelEpoch}`}
                block={selected}
                pending={updateConfig.isPending || removeBlock.isPending}
                onChange={(config) =>
                  updateConfig.mutate({ studyId: study.id, instanceId: selected.instanceId, config })
                }
                onRename={(title) =>
                  renameBlock.mutate({ studyId: study.id, instanceId: selected.instanceId, title })
                }
                onRemove={() => {
                  removeBlock.mutate({ studyId: study.id, instanceId: selected.instanceId });
                  setSelectedId(null);
                }}
              />
              <ConditionBuilder
                key={`cond-${selected.instanceId}-${panelEpoch}`}
                block={selected}
                earlierBlocks={study.blocks.slice(0, study.blocks.findIndex((b) => b.instanceId === selected.instanceId))}
                pending={setCondition.isPending}
                onSave={(showIf) =>
                  setCondition.mutate({ studyId: study.id, instanceId: selected.instanceId, showIf })
                }
              />
              <BlockVisibilityField
                key={`vis-${selected.instanceId}-${panelEpoch}`}
                studyId={study.id}
                instanceId={selected.instanceId}
                current={selected.showIfCondition}
              />
            </>
          ) : (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Select a block on the canvas to configure it, or “Add block” to drop a new one.
            </p>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={pendingReorder !== null}
        title="Reordering will remove some conditions"
        body="These conditions point at blocks that would no longer come earlier in the flow, so they’ll be removed:"
        items={pendingReorder?.items ?? []}
        confirmLabel="Reorder and remove"
        tone="danger"
        onConfirm={() => {
          if (pendingReorder)
            setGroupsMut.mutate({ studyId: study.id, blocks: pendingReorder.blocks, groups: pendingReorder.groups });
          setPendingReorder(null);
        }}
        onCancel={() => setPendingReorder(null)}
      />
    </main>
  );
}
