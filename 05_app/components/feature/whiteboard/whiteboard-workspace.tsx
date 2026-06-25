"use client";

import { Plus, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { BlockVisibilityField } from "@/components/feature/builder/block-visibility-field";
import { ConfigureForm } from "@/components/feature/builder/configure-form";
import { ModeToggle } from "@/components/feature/builder/mode-toggle";
import { BlockLibraryModal } from "@/components/feature/builder/block-library-modal";
import { api } from "@/lib/trpc/react";
import type { StudyBlock, StudyDetail } from "@/server/trpc/routers/studies";
import { deriveScreens, regroupAfterMove } from "@/lib/whiteboard/screens";

import { newlyBrokenByReorder, summarizeClause } from "@/lib/whiteboard/conditions";
import { useBlockHistory } from "@/lib/whiteboard/use-block-history";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { ConditionBuilder } from "./condition-builder";
import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardList } from "./whiteboard-list";
import { canWriteRole, READ_ONLY_TITLE, ReadOnlyBanner } from "@/components/feature/workspace/role-gate";
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
  // Arm representation on the canvas: chips on one spine (default) or one lane per
  // arm (ADR-0057). Insert index for "add a step after" from a node's toolbar.
  const [armView, setArmView] = useState<"chips" | "swimlane">("swimlane");
  const [insertIndex, setInsertIndex] = useState<number | undefined>(undefined);
  // Viewers are read-only (mirrors writeProcedure) — same gate as the Builder.
  const canEdit = canWriteRole(study.viewerRole);

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
  // Bump on a restore (undo/redo) so the right-panel editors re-seed.
  const [panelEpoch, setPanelEpoch] = useState(0);
  const setGroupsMut = api.studies.setGroups.useMutation({
    onSuccess: () => {
      void invalidate();
      setPanelEpoch((e) => e + 1);
    },
  });
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
  const requestReorder = (order: string[], movedId: string) => {
    if (!canEdit) return; // viewers can view the list but not reorder
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
  // ----- on-canvas screen editing (ADR-0057 B) — reuse the same mutations -----
  const screensNow = () => deriveScreens(study.blocks.map((b) => toInstance(b, b.groupId)), study.groups);
  // Move a whole screen (single block or group) up/down the spine. Screens are
  // contiguous block runs, so swapping two screens = swapping two runs.
  const moveScreen = (screenId: string, dir: "up" | "down") => {
    if (!canEdit) return;
    const screens = screensNow();
    const idx = screens.findIndex((s) => s.id === screenId);
    const t = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || t < 0 || t >= screens.length) return;
    const reordered = [...screens];
    [reordered[idx], reordered[t]] = [reordered[t], reordered[idx]];
    // The screen blocks ARE toInstance() results (screensNow built them); deriveScreens
    // just widens the type back to BlockInstance, so this cast is sound.
    const blocks = reordered.flatMap((s) => s.blocks) as ReturnType<typeof toInstance>[];
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const nextStudyBlocks = blocks.map((bi) => byId.get(bi.instanceId)!);
    const broken = newlyBrokenByReorder(study.blocks, nextStudyBlocks);
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = study.groups.filter((g) => usedIds.has(g.id));
    if (broken.length === 0) {
      setGroupsMut.mutate({ studyId: study.id, blocks, groups });
      return;
    }
    setPendingReorder({ blocks, groups, items: broken.map((b) => `"${nameOfBlock(b.targetId)}": ${summarizeClause(b.clause, nameOfBlock)}`) });
  };
  // Open the block library to insert a new screen right after this one.
  const addStepAfter = (screenId: string) => {
    if (!canEdit) return;
    const screens = screensNow();
    const s = screens.find((x) => x.id === screenId);
    const lastId = s?.blocks[s.blocks.length - 1]?.instanceId;
    const at = study.blocks.findIndex((b) => b.instanceId === lastId);
    setInsertIndex(at >= 0 ? at + 1 : undefined);
    setPickerOpen(true);
  };
  // Delete an entire screen — a single block, or every member of a group.
  const deleteScreen = (screenId: string) => {
    if (!canEdit) return;
    const screens = screensNow();
    const s = screens.find((x) => x.id === screenId);
    if (!s) return;
    if (selectedId && s.blocks.some((b) => b.instanceId === selectedId)) setSelectedId(null);
    if (s.kind === "single") {
      removeBlock.mutate({ studyId: study.id, instanceId: s.blocks[0].instanceId });
      return;
    }
    const memberIds = new Set(s.blocks.map((b) => b.instanceId));
    const blocks = study.blocks.filter((b) => !memberIds.has(b.instanceId)).map((b) => toInstance(b, b.groupId));
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    setGroupsMut.mutate({ studyId: study.id, blocks, groups: study.groups.filter((g) => usedIds.has(g.id)) });
  };

  const setCondition = api.studies.setBlockCondition.useMutation({ onSuccess: () => void invalidate() });
  const { canUndo, canRedo, undo, redo } = useBlockHistory(study.id, study.blocks, study.groups, (snap) =>
    setGroupsMut.mutate({ studyId: study.id, blocks: snap.blocks, groups: snap.groups }),
  );

  // Experimental arms (conditions) feed the diagram's arm chips + the assignment
  // node; arm-visibility itself is edited in the selected block's panel below.
  const conditions = api.studies.listConditions.useQuery({ studyId: study.id });

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
      <ReadOnlyBanner role={study.viewerRole} />
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
                disabled={!canEdit || !canUndo || setGroupsMut.isPending}
                title={canEdit ? "Undo last change" : READ_ONLY_TITLE}
                aria-label="Undo last change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canEdit || !canRedo || setGroupsMut.isPending}
                title={canEdit ? "Redo" : READ_ONLY_TITLE}
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
              {view === "canvas" && (conditions.data ?? []).length > 1 ? (
                <div role="group" aria-label="Condition view" className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5 text-[length:var(--text-small)]">
                  {([["swimlane", "By condition"], ["chips", "Combined"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={armView === v}
                      onClick={() => setArmView(v)}
                      className={cn(
                        "rounded-[var(--radius-sm)] px-2 py-1 font-medium",
                        armView === v
                          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={!canEdit}
                  title={canEdit ? undefined : READ_ONLY_TITLE}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden />
                  Add block
                </button>
                {pickerOpen ? (
                  <BlockLibraryModal
                    pending={addBlock.isPending}
                    onClose={() => { setPickerOpen(false); setInsertIndex(undefined); }}
                    onInsert={(m) => addBlock.mutate({ studyId: study.id, ...m, ...(insertIndex != null ? { atIndex: insertIndex } : {}) })}
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
                editable={canEdit}
                armView={armView}
                conditions={(conditions.data ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
                selectedId={selectedId}
                onSelectBlock={setSelectedId}
                onMoveScreen={moveScreen}
                onAddAfter={addStepAfter}
                onDeleteScreen={deleteScreen}
              />
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {"The diagram shows the exact flow a participant follows — Start, each screen in order, branches where answer logic skips a screen, and where it ends. Click a screen to configure it; edit conditions and arm-visibility in its panel."}
                {(conditions.data ?? []).length === 0
                  ? " Add conditions in Builder’s Conditions section to split the flow by condition."
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
            <fieldset disabled={!canEdit} className="contents">
              <ConfigureForm
                key={`${selected.instanceId}-${panelEpoch}`}
                studyId={study.id}
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
            </fieldset>
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
