"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { BlockVisibilityField } from "@/components/feature/builder/block-visibility-field";
import { ConfigureForm } from "@/components/feature/builder/configure-form";
import { ModeToggle } from "@/components/feature/builder/mode-toggle";
import { ModulePicker } from "@/components/feature/builder/module-picker";
import { api } from "@/lib/trpc/react";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import {
  isConditionSource,
  newlyBrokenByReorder,
  normalizeCondition,
  summarizeClause,
} from "@/lib/whiteboard/conditions";
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
  const reorderBlocks = api.studies.reorderBlocks.useMutation({ onSuccess: () => void invalidate() });
  const [pendingReorder, setPendingReorder] = useState<{ order: string[]; items: string[] } | null>(null);
  const nameOfBlock = (id: string) => {
    const b = study.blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };
  const requestReorder = (order: string[]) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as typeof study.blocks;
    // Only warn about conditions that are valid now but this move would break.
    const broken = newlyBrokenByReorder(study.blocks, ordered);
    if (broken.length === 0) {
      reorderBlocks.mutate({ studyId: study.id, order });
      return;
    }
    setPendingReorder({
      order,
      items: broken.map((b) => `"${nameOfBlock(b.targetId)}": ${summarizeClause(b.clause, nameOfBlock)}`),
    });
  };
  const setCondition = api.studies.setBlockCondition.useMutation({ onSuccess: () => void invalidate() });

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
              />
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {"Drag a wire from one block to another to branch on its answer (you’ll set the trigger value); or from a Condition node to a block to gate it by arm. Select a wire and press Delete to remove it."}
                {(conditions.data ?? []).length === 0
                  ? " Add conditions in Builder’s Conditions section to wire arm-visibility too."
                  : ""}
              </p>
            </>
          ) : (
            <WhiteboardList
              blocks={study.blocks}
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
                key={selected.instanceId}
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
                key={`cond-${selected.instanceId}`}
                block={selected}
                earlierBlocks={study.blocks.slice(0, study.blocks.findIndex((b) => b.instanceId === selected.instanceId))}
                pending={setCondition.isPending}
                onSave={(showIf) =>
                  setCondition.mutate({ studyId: study.id, instanceId: selected.instanceId, showIf })
                }
              />
              <BlockVisibilityField
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
          if (pendingReorder) reorderBlocks.mutate({ studyId: study.id, order: pendingReorder.order });
          setPendingReorder(null);
        }}
        onCancel={() => setPendingReorder(null)}
      />
    </main>
  );
}
